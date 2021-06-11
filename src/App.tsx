import * as React from 'react';
import { useEffect, useState } from "react";

import styled from 'styled-components';

import Web3Modal from 'web3modal';
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider';
import Column from './components/Column';
import Wrapper from './components/Wrapper';
import Header from './components/Header';
import Loader from './components/Loader';
import ConnectButton from './components/ConnectButton';

import { Web3Provider } from '@ethersproject/providers';
import { getChainData, showNotification } from './helpers/utilities';
import { LIBRARY_CONTRACT_ADDRESS } from './constants/constants';
import BOOK_LIBRARY from "./constants/contracts/BookLibrary.json";
import { getContract } from './helpers/ethers';
import BookLibrary from './components/BookLibrary';
import IBook from './models/interfaces/IBook';
import MiningSvg from "./assets/mining.svg";

const SLayout = styled.div`
  position: relative;
  width: 100%;
  min-height: 100vh;
  text-align: center;
`;

const SContent = styled(Wrapper)`
  width: 100%;
  height: 100%;
  padding: 0 16px;
`;

const SContainer = styled.div`
  height: 100%;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  word-break: break-word;
`;

const SLanding = styled(Column)`
  height: 600px;
`;

// @ts-ignore
const SBalances = styled(SLanding)`
  height: 100%;
  & h3 {
    padding-top: 30px;
  }
`;

let web3Modal: Web3Modal;
const App = () => {

  const [provider, setProvider] = useState<any>();
  const [fetching, setFetching] = useState<boolean>(false);
  const [fetchingBooks, setFetchingBooks] = useState<boolean>(true);
  const [address, setAddress] = useState<string>("");
  const [library, setLibrary] = useState<any>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [chainId, setChainId] = useState<number>(1);
  const [pendingRequest, setPedningRequest] = useState<boolean>(false);
  const [result, setResult] = useState<any>();
  const [libraryContract, setLibraryContract] = useState<any>(null);
  const [info, setInfo] = useState<any>(null);
  const [transactionHash, setTransactionHash] = useState<string>("");
  const [books, setBooks] = useState<IBook[]>([])
  const [bookInfo, setBookInfo] = useState<IBook>({
    Title:"",
    Copies: 0,
    IsBorrowed: false
  })

  useEffect(() => {
    createWeb3Modal();
    
    if (web3Modal.cachedProvider) {
      onConnect();
    }

  }, []);

  function createWeb3Modal() {
    web3Modal = new Web3Modal({
      network: getNetwork(),
      cacheProvider: true,
      providerOptions: getProviderOptions()
    })
  }

  const onConnect = async () => {
    const provider = await web3Modal.connect();
    setProvider(provider);

    const library = new Web3Provider(provider);

    const network = await library.getNetwork();

    const address = provider.selectedAddress ? provider.selectedAddress : provider?.accounts[0];
    
    const libraryContract = getContract(LIBRARY_CONTRACT_ADDRESS, BOOK_LIBRARY.abi, library, address);
    setLibrary(library);
    setChainId(network.chainId);
    setAddress(address);
    setConnected(true);
    setLibraryContract(libraryContract);
    
    await subscribeToProviderEvents(provider);

    await fetchBooks(libraryContract);
  };

  const subscribeToProviderEvents = async (provider:any) => {
    if (!provider.on) {
      return;
    }

    provider.on("accountsChanged", changedAccount);
    provider.on("networkChanged", networkChanged);
    provider.on("close", resetApp);

    await web3Modal.off('accountsChanged');
  };

  const unSubscribe = async (provider:any) => {
    // Workaround for metamask widget > 9.0.3 (provider.off is undefined);
    window.location.reload(false);
    if (!provider.off) {
      return;
    }

    provider.off("accountsChanged", changedAccount);
    provider.off("networkChanged", networkChanged);
    provider.off("close", resetApp);
  }

  const changedAccount = async (accounts: string[]) => {
    if(!accounts.length) {
      // Metamask Lock fire an empty accounts array 
      await resetApp();
    } else {
      setAddress(accounts[0]);
    }
  }

  const networkChanged = async (networkId: number) => {
    const library = new Web3Provider(provider);
    const network = await library.getNetwork();
    const chainId = network.chainId;
    setChainId(chainId);
    setLibrary(library);
  }

  function getNetwork() {
    return getChainData(chainId).network;
  }

  function getProviderOptions() {
    const providerOptions = {
      walletconnect: {
        package: WalletConnectProvider,
        options: {
          infuraId: process.env.REACT_APP_INFURA_ID
        }
      }
    };
    return providerOptions;
  };

  const resetApp = async () => {
    
    await web3Modal.clearCachedProvider();
    localStorage.removeItem("WEB3_CONNECT_CACHED_PROVIDER");
    localStorage.removeItem("walletconnect");
    await unSubscribe(provider);

  };

  const resetState = () => {
    setFetching(false);
    setAddress("");
    setLibrary(null);
    setConnected(false);
    setChainId(1);
    setPedningRequest(false);
    setResult(null);
    setLibraryContract(null);
    setInfo(null);
  }
  const borrowBook = async (title: string) => {
    try {
      if (books.filter(b => b.Title === title).length) {
        const transaction = await libraryContract.borrowBook(title);
        setFetching(true);
        setTransactionHash(transaction.hash)
        const receipt = await transaction.wait();
        if(receipt.status !== 1) {
          alert("Transaction failed");
        }
        showNotification(`Successfully borrowed ${title} from the library`);
        setFetching(false);
        fetchBooks();
      }
    } catch(err) {
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }
  }

  const fetchBooks = async (libContract?: any) => {
    try {
      const newBooks: IBook[] = [];
      setFetchingBooks(true);
      const contract = libraryContract || libContract;
      const booksCount = (await contract.getBooksCount()).toNumber();
      for (let i = 0; i < booksCount; i++) {
        const bookId = await contract.booksIds(i);
        const book = await contract.books(bookId);
        const isBorrowed = await contract.isBookBorrowedByCurrentUser(book.name);
        newBooks.push({Title: book.name, Copies: book.copies, IsBorrowed: isBorrowed});
      }
      setBooks(newBooks);
      setFetchingBooks(false);
    } catch(err) {
      setBooks([]);
      setFetchingBooks(false);
      alert("Failed to load books...");
    }
  }

  const submitBook = async () => {
    try {
      if (bookInfo.Title && bookInfo.Copies) {
        const transaction = await libraryContract.addBook(bookInfo.Title, +bookInfo.Copies);
        setFetching(true);
        setTransactionHash(transaction.hash)
        const receipt = await transaction.wait();
        if(receipt.status !== 1) {
          alert("Transaction failed");
        }
        showNotification(`Successfully added "${bookInfo.Title}" to the library!`)
        setFetching(false);
        fetchBooks();
      } else {
        alert("Invalid title or copies")
      }
    } catch(err) {
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }
  }

  const handleChange = (e: any) => {
    const newInfo = {...bookInfo, [e.target.name]: e.target.value}
    setBookInfo(newInfo);
  }

  const returnBook = async (title: string) => {
    try {
      if (books.filter(b => b.Title === title).length) {
        const transaction = await libraryContract.returnBook(title);
        setFetching(true);
        setTransactionHash(transaction.hash)
        const receipt = await transaction.wait();
        if(receipt.status !== 1) {
          alert("Transaction failed");
        }
        showNotification("Successfully returned book!")
        setFetching(false);
        fetchBooks();
      } else {
        alert("Books doesn't exist or isn't available");
      }
    } catch(err) {
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }

  }

  return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={resetApp}
          />
          <SContent>
              {fetching ? (
                <Column center>
                  <SContainer>
                    <Loader transactionHash={transactionHash} />
                  </SContainer>
                </Column>
              ) :
                !connected ?
                  <SLanding center>
                    <ConnectButton onClick={onConnect} />
                  </SLanding> :
                  <SLanding>
                    <BookLibrary
                      books={books}
                      borrowBook={borrowBook}
                      fetchBooks={fetchBooks}
                      submitBook={submitBook}
                      handleChange={handleChange}
                      bookInfo={bookInfo}
                      returnBook={returnBook}
                      fetchingBooks={fetchingBooks}
                    />
                  </SLanding>
              }
            </SContent>
        </Column>
      </SLayout>
  );
}
export default App;
