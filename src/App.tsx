import * as React from 'react';
import { useEffect, useState } from "react";
import {BigNumber, ethers} from "ethers";
import styled from 'styled-components';

import Web3Modal from 'web3modal';
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider';
import Column from './components/Column';
import Wrapper from './components/Wrapper';
import Header from './components/Header';
import Loader from './components/Loader';
import ConnectButton from './components/ConnectButton';
import BookLibrary from './components/BookLibrary';
import IBook from './models/interfaces/IBook';

import { Web3Provider } from '@ethersproject/providers';
import { getChainData, showNotification } from './helpers/utilities';
import { getContract } from './helpers/ethers';

import {
  LIBRARY_CONTRACT_ADDRESS,
  } from './constants/constants';

import BOOK_LIBRARY from "./constants/contracts/BookLibrary.json";
import LIBRARY_TOKEN from "./constants/contracts/LibraryToken.json";
import LIB_WRAPPER from "./constants/contracts/LIBWrapper.json";


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

  const [web3Provider, setWeb3Provider] = useState<any>();
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [web3Library, setWeb3Library] = useState<any>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [chainId, setChainId] = useState<number>(1);
  const [pendingRequest, setPedningRequest] = useState<boolean>(false);
  const [result, setResult] = useState<any>();
  
  const [libraryContract, setLibraryContract] = useState<any>(null);
  const [libToken, setLibToken] = useState<any>(null);
  const [libWrapperContract, setLibWrapperContract] = useState<any>(null);
  
  const [fetching, setFetching] = useState<boolean>(false);
  const [fetchingBooks, setFetchingBooks] = useState<boolean>(true);
  const [info, setInfo] = useState<any>(null);
  const [transactionHash, setTransactionHash] = useState<string>("");
  const [books, setBooks] = useState<IBook[]>([]);
  const [LIBBalance, setLIBBalance] = useState<string>("");
  const [contractBalance, setContractBalance] = useState<string>("")
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
    
    const web3Provider = await web3Modal.connect();
    const web3Library = new Web3Provider(web3Provider);
    const network = await web3Library.getNetwork();
    const address = web3Provider.selectedAddress ? web3Provider.selectedAddress : web3Provider?.accounts[0];

    const libraryContract = getContract(LIBRARY_CONTRACT_ADDRESS, BOOK_LIBRARY.abi, web3Library, address);
    
    const wrapperAddress = await libraryContract.LIBTokenWrapper();
    let isValidAddress = ethers.utils.isAddress(wrapperAddress);
    console.log(wrapperAddress);
    console.log(isValidAddress);
    const libTokenWrapper = getContract(wrapperAddress, LIB_WRAPPER.abi, web3Library, address);
    
    const tokenAddress = await libraryContract.LIBToken();
    isValidAddress = ethers.utils.isAddress(tokenAddress);
    console.log(tokenAddress);
    console.log(isValidAddress);
    const libraryToken = getContract(tokenAddress, LIBRARY_TOKEN.abi, web3Library, address);

    const libraryTokenBalance = await libraryToken.balanceOf(address);
    const tokenDecimals = await libraryToken.decimals();
    
    const contractBalance = await libTokenWrapper.provider.getBalance(libTokenWrapper.address);


    setWeb3Provider(web3Provider);
    setWeb3Library(web3Library);
    setChainId(network.chainId);
    setWalletAddress(address);
    setConnected(true);
    
    setLibraryContract(libraryContract);
    setLibToken(libraryToken);
    setLibWrapperContract(libTokenWrapper);

    setContractBalance(formatToken(contractBalance, tokenDecimals));
    setLIBBalance(formatToken(libraryTokenBalance, tokenDecimals));

    await subscribeToProviderEvents(web3Provider);
    // await subscribeToContractEvents(libraryContract, tokenAddress);
    await fetchBooks(libraryContract);

  };

  const subscribeToContractEvents = async (libraryContract: any, tokenAddress: any) => {
    libraryContract.on("LogBookAdded", async (bookName: string, copies: number, tx: any) => {
      showNotification(`${copies} of "${bookName}" have just been added to the library`);
      await fetchBooks(libraryContract);
    });

    libraryContract.on("LogBookBorrowed", async (bookName: string, borrower: string, tx: any) => {
      showNotification(`"${bookName}" has just been borrowed by ${borrower}`);
      await fetchBooks();
    });

    libraryContract.on("LogBookReturned", async (bookName: string, returner: string, tx: any) => {
      showNotification(`"${bookName}" has just been returned by ${returner}`);
      await fetchBooks();
    });

    const LibTokenTransferFilter = libraryContract.filters.Transfer(null, tokenAddress, null);

    libraryContract.on(LibTokenTransferFilter, (from: string, to: string, value: string, tx: any) => {
      showNotification(`${value} ETH have just been transfered from ${from}. Block: ${tx.blockNumber}`);
    })
  }


  const updateBalance = async () => {
    const libraryTokenBalance = await libToken.balanceOf(walletAddress);
    const contractBalance = await libWrapperContract.provider.getBalance(libWrapperContract.address);
    
    const tokenDecimals = await libToken.decimals();

    setLIBBalance(formatToken(libraryTokenBalance, tokenDecimals));
    setContractBalance(formatToken(contractBalance, tokenDecimals));
  }

  const mintToken = async (amountToMint: string, token: any, address: string) => {
    const decimals = await token.decimals();
    const amount = await ethers.utils.parseUnits(amountToMint, decimals);
    await token.wrap(address, amount);
  }

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

    libraryContract.removeAllListeners();
  }

  const changedAccount = async (accounts: string[]) => {
    if(!accounts.length) {
      // Metamask Lock fire an empty accounts array 
      await resetApp();
    } else {
      setWalletAddress(accounts[0]);
    }
  }

  const networkChanged = async (networkId: number) => {
    const library = new Web3Provider(web3Provider);
    const network = await library.getNetwork();
    const chainId = network.chainId;
    setChainId(chainId);
    setWeb3Library(library);
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
    await unSubscribe(web3Provider);
  };

  const resetState = () => {
    setFetching(false);
    setWalletAddress("");
    setWeb3Library(null);
    setConnected(false);
    setChainId(1);
    setPedningRequest(false);
    setResult(null);
    setLibraryContract(null);
    setInfo(null);
  };

  const borrowBook = async (title: string) => {
    try {
      if (books.filter(b => b.Title === title).length) {
        const result = await libToken.approve(libraryContract.address, BigNumber.from("10000000000000000"))
        console.log(result);
        if (result) {
          const transaction = await libraryContract.borrowBook(title);
          setFetching(true);
          setTransactionHash(transaction.hash)
          const receipt = await transaction.wait();
          if(receipt.status !== 1) {
            alert("Transaction failed");
          }
          // showNotification(`Successfully borrowed ${title} from the library`);
          // await fetchBooks();
          await updateBalance();
          setFetching(false);
        } else {
          alert("Increasing allowance failed")
        }
      }
    } catch(err) {
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }
  };

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
  };

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
        // showNotification(`Successfully added "${bookInfo.Title}" to the library!`)
        // fetchBooks();
        setFetching(false);
      } else {
        alert("Invalid title or copies")
      }
    } catch(err) {
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }
  };

  const handleChange = (e: any) => {
    const newInfo = {...bookInfo, [e.target.name]: e.target.value}
    setBookInfo(newInfo);
  };

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
        // showNotification("Successfully returned book!")
        // fetchBooks();
        setFetching(false);
      } else {
        alert("Books doesn't exist or isn't available");
      }
    } catch(err) {
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }

  };

  const convertEthToLib = async () => {
    const wrapValue = ethers.utils.parseEther("0.01")
    const wrapTx = await libWrapperContract.wrap({value: wrapValue});
    setFetching(true);
    setTransactionHash(wrapTx.hash)
    const receipt = await wrapTx.wait();
    if(receipt.status !== 1) {
      alert("Transaction failed");
    }

    const balance = await libToken.balanceOf(walletAddress);
    const decimals = await libToken.decimals();
    const formatedBalance = formatToken(balance, decimals);

    showNotification("Successfully converted ETH to LIB!")
    setLIBBalance(formatedBalance);
    setFetching(false);
  };

  const withdrawLIB = async () => {
    const unwrapValue = ethers.utils.parseEther("0.01");
    const result = await libToken.approve(libWrapperContract.address, BigNumber.from("10000000000000000"))
    console.log(result);
    if (result) {
      const unwrapTx = await libWrapperContract.unwrap(unwrapValue);
      setFetching(true);
      setTransactionHash(unwrapTx.hash)
      const receipt = await unwrapTx.wait();
      if(receipt.status !== 1) {
        alert("Transaction failed");
      }
  
      const balance = await libToken.balanceOf(walletAddress);
      const decimals = await libToken.decimals();
      const formatedBalance = formatToken(balance, decimals);
  
      showNotification("Successfully unwrapped LIB to ETH!")
      setLIBBalance(formatedBalance);
      setFetching(false);    
    } else {
      alert("Increase allowance failed")
    }
  }

  const formatToken = (wei: BigNumber, decimals: number = 18) => {
    return ethers.utils.formatUnits(wei, decimals);
  }

  return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={walletAddress}
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
                      tokenBalance={LIBBalance}
                      convertEthToLib={convertEthToLib}
                      withdrawLIB={withdrawLIB}
                      contractBalance={contractBalance}
                    />
                  </SLanding>
              }
            </SContent>
        </Column>
      </SLayout>
  );
}
export default App;
