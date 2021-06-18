import * as React from 'react';
import styled from 'styled-components';
import { useEffect, useState } from "react";
import {BigNumber, BigNumberish, ethers} from "ethers";
import { ecrecover, toBuffer, pubToAddress, bufferToHex } from 'ethereumjs-util';

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

const abiCoder = new ethers.utils.AbiCoder();
const keccak256 = ethers.utils.solidityKeccak256;

// Difference between token.balanceOf and token.provider.balanceOf ?

const App = () => {
  const [web3Provider, setWeb3Provider] = useState<any>();
  const [userAddress, setUserAddress] = useState<string>("");
  const [web3Library, setWeb3Library] = useState<any>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [chainId, setChainId] = useState<number>(1);
  const [pendingRequest, setPedningRequest] = useState<boolean>(false);
  const [result, setResult] = useState<any>();
  
  const [libraryContract, setLibraryContract] = useState<any>(null);
  const [tokenContract, setTokenContract] = useState<any>(null);
  const [libWrapperContract, setLibWrapperContract] = useState<any>(null);
  
  const [fetching, setFetching] = useState<boolean>(false);
  const [fetchingBooks, setFetchingBooks] = useState<boolean>(true);
  const [info, setInfo] = useState<any>(null);
  const [transactionHash, setTransactionHash] = useState<string>("");
  const [books, setBooks] = useState<IBook[]>([]);
  const [userLibBalance, setUserLibBalance] = useState<string>("");
  const [contractBalance, setContractBalance] = useState<string>("");
  const [rentFee, setRentFee] = useState<string>("");
  const [newBookInfo, setNewBookInfo] = useState<IBook>({
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
    let isValidAddress = ethers.utils.isAddress(LIBRARY_CONTRACT_ADDRESS);
    
    if (isValidAddress) {
      const libraryContract = getContract(LIBRARY_CONTRACT_ADDRESS, BOOK_LIBRARY.abi, web3Library, address);
      const wrapperAddress = await libraryContract.LIBTokenWrapper();
      console.log(wrapperAddress)
      isValidAddress = ethers.utils.isAddress(wrapperAddress);

      if(isValidAddress) {
        const libTokenWrapper = getContract(wrapperAddress, LIB_WRAPPER.abi, web3Library, address);
        const tokenAddress = await libraryContract.LIBToken();
        console.log(tokenAddress)
        isValidAddress = ethers.utils.isAddress(tokenAddress);
        if(isValidAddress) {  
          const libraryToken = getContract(tokenAddress, LIBRARY_TOKEN.abi, web3Library, address);
      
          const libraryTokenBalance = await libraryToken.balanceOf(address);
          const tokenDecimals = await libraryToken.decimals();
          
          const contractBalance = await libraryToken.balanceOf(LIBRARY_CONTRACT_ADDRESS);
      
          const rentFee = await libraryContract.rentFee();
      
          setWeb3Provider(web3Provider);
          setWeb3Library(web3Library);
          setChainId(network.chainId);
          setUserAddress(ethers.utils.getAddress(address));
          setConnected(true);
          
          setLibraryContract(libraryContract);
          setTokenContract(libraryToken);
          setLibWrapperContract(libTokenWrapper);
      
          setContractBalance(formatToken(contractBalance, tokenDecimals));
          setUserLibBalance(formatToken(libraryTokenBalance, tokenDecimals));
          setRentFee(formatToken(rentFee, 18));
      
          await subscribeToProviderEvents(web3Provider);
          await subscribeToContractEvents(libraryContract, LIBRARY_CONTRACT_ADDRESS, libraryToken);
          await fetchBooks(libraryContract);
        } else {
          alert("Invalid token address");
        }
      } else {
        alert("Invalid token wrapper address")
      }
    } else {
      alert("Invalid library contract");
    }
  };

  const subscribeToContractEvents = async (libraryContract: any, libContractAddress: any, libraryToken: any) => {
    libraryContract.on("LogBookAdded", async (bookName: string, copies: number, tx: any) => {
      showNotification(`${copies} of "${bookName}" have just been added to the library`);
      await fetchBooks(libraryContract);
    });

    libraryContract.on("LogBookBorrowed", async (bookName: string, borrower: string, tx: any) => {
      showNotification(`"${bookName}" has just been borrowed by ${borrower}`);
      await fetchBooks(libraryContract);
    });

    libraryContract.on("LogBookReturned", async (bookName: string, returner: string, tx: any) => {
      showNotification(`"${bookName}" has just been returned by ${returner}`);
      await fetchBooks(libraryContract);
    });

    const LibTokenTransferFilter = libraryToken.filters.Transfer(null, libContractAddress, null);

    libraryToken.on(LibTokenTransferFilter, (from: string, to: string, value: string, tx: any) => {
      showNotification(`${formatToken(value, 18)} ETH have just been transfered from ${from}. Block: ${tx.blockNumber}`);
    })
  }

  const updateBalances = async () => {
    if(tokenContract && userAddress) {
      const userLibBalance = await tokenContract.balanceOf(userAddress);
      const contractBalance = await tokenContract.balanceOf(LIBRARY_CONTRACT_ADDRESS);
      const tokenDecimals = await tokenContract.decimals();

      console.log(`Library Contract balance: ${formatToken(contractBalance, tokenDecimals)}`);
      console.log(`User balance: ${formatToken(userLibBalance, tokenDecimals)}`);

      setUserLibBalance(formatToken(userLibBalance, tokenDecimals));
      setContractBalance(formatToken(contractBalance, tokenDecimals));
    }
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
      setUserAddress(accounts[0]);
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
    await libraryContract.removeAllListeners();
    await tokenContract.removeAllListeners();
  };

  const resetState = () => {
    setFetching(false);
    setUserAddress("");
    setWeb3Library(null);
    setConnected(false);
    setChainId(1);
    setPedningRequest(false);
    setResult(null);
    setLibraryContract(null);
    setInfo(null);
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
      if (newBookInfo.Title && newBookInfo.Copies) {
        const transaction = await libraryContract.addBook(newBookInfo.Title, +newBookInfo.Copies);
        setFetching(true);
        setTransactionHash(transaction.hash)
        const receipt = await transaction.wait();

        if(receipt.status !== 1) {
          alert("Transaction failed");
        }

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
    const newInfo = {...newBookInfo, [e.target.name]: e.target.value}
    setNewBookInfo(newInfo);
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

  const borrowBook = async (title: string) => {
    try {
      const balance = ethers.utils.parseEther(userLibBalance);
      const rentFeeBN = ethers.utils.parseEther(rentFee);
      if (balance >= rentFeeBN) {
        if (books.filter(b => b.Title === title).length) {
          const approveTx = await tokenContract.approve(libraryContract.address, rentFeeBN);
          setFetching(true);
          setTransactionHash(approveTx.hash)
          const approveTxReceipt = await approveTx.wait();
          if (approveTxReceipt.status !== 1) {
            alert(`Approval to spend ${rentFee} LIB failed`);
          } else {
            const borrowTx = await libraryContract.borrowBook(title);
            setTransactionHash(borrowTx.hash);
            const borrowTxReceipt = await borrowTx.wait();
            if(borrowTxReceipt.status !== 1) {
              alert("Borrowing failed");
            }
            await updateBalances();
          }
        }
        setFetching(false);
        setTransactionHash("")
      } else {
        alert("Insufficient LIB to borrow book");
      }
    } catch(err) {
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }
  };

  const borrowBookWithPermit = async (title: string) => {
    try {
      const balance = ethers.utils.parseEther(userLibBalance);
      const rentFeeBN = ethers.utils.parseEther(rentFee);
      if (balance >= rentFeeBN) {
        if (books.filter(b => b.Title === title).length) {
          const preparedSignature = await onAttemptToApprove();
          if (preparedSignature) {
            const { v, r, s, deadline } = preparedSignature;
            // const isValidAddress = await recoverAddressBeforePermit(preparedSignature, message);
            const recoveredAddress = await tokenContract.getRecoveredAddress(userAddress, LIBRARY_CONTRACT_ADDRESS,
               rentFeeBN, deadline, v, r, s );
            if (recoveredAddress === userAddress) {
              const borrowTx = await libraryContract.borrowBookWithPermit(title, rentFeeBN, deadline, v, r, s);
              setTransactionHash(borrowTx.hash);
              setFetching(true);
              const borrowTxReceipt = await borrowTx.wait();
              if(borrowTxReceipt.status !== 1) {
                alert("Borrowing failed");
              }
            } else {
              alert("Failed to verify signer");
            }
            await updateBalances();
          } else {
            alert("Failed to create signature");
          }
        }
        setFetching(false);
        setTransactionHash("")
      } else {
        alert("Insufficient LIB to borrow book");
      }
    } catch(err) {
      console.log(err);
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }
  };

  const withdrawLIB = async () => {
    try {
      const unwrapValue = ethers.utils.parseEther("0.01");
      const approveTx = await tokenContract.approve(libWrapperContract.address, unwrapValue)
      setFetching(true);
      setTransactionHash(approveTx.hash)
      const approveTxReceipt = await approveTx.wait();
      if (approveTxReceipt.status !== 1) {
        alert("Increase allowance failed");
      } else {
        const unwrapTx = await libWrapperContract.unwrap(unwrapValue);
        setTransactionHash(unwrapTx.hash)
        const unwrapTxReceipt = await unwrapTx.wait();
        if(unwrapTxReceipt.status !== 1) {
          alert("Transaction failed");
        } else {
          const balance = await tokenContract.balanceOf(userAddress);
          const decimals = await tokenContract.decimals();
          const formatedBalance = formatToken(balance, decimals);
      
          showNotification("Successfully unwrapped LIB to ETH!")
          updateBalances();
        }
      }
      setFetching(false);    
    } catch(err) {
      setFetching(false);
      alert("Transaction failed");
    }
  }

  const withdrawRent = async () => {
    try {
      const unwrapValue = ethers.utils.parseEther("0.01");
      const ctBalance = ethers.utils.parseEther(contractBalance);
      if (ctBalance >= unwrapValue) {
        const withdrawTx = await libraryContract.withdrawLibTokens();
        setFetching(true);
        setTransactionHash(withdrawTx.hash);
        const withdrawTxreceipt = withdrawTx.wait();
        if (withdrawTxreceipt.status !== 1) {
          alert("Withraw transaction failed");
        } else {
          updateBalances();
        }
      } else {
        alert("Insufficient contract balance");
      }
      setFetching(false);
      setTransactionHash("");
    } catch(err) {
      console.log(err);
      alert("Withdrawing funds failed");
      setFetching(false);
      setTransactionHash("");
    }
  }


  const wrapEthToLib = async () => {
    const value = "0.01"
    const wrapValue = ethers.utils.parseEther(value)
    const wrapTx = await libWrapperContract.wrap({value: wrapValue});

    setFetching(true);
    setTransactionHash(wrapTx.hash)

    const receipt = await wrapTx.wait();
    if(receipt.status !== 1) {
      alert("Transaction failed");
    }

    showNotification(`Successfully converted ${value} ETH to ${value} LIB!`);

    await updateBalances();
    setFetching(false);
  };

  const wrapWithSignature = async (message: string = "") => {
    const [hashedMessage, signedMessage] = await signMessage(message);
    const value = "0.01";
    const wrapValue = ethers.utils.parseEther(value);
    const sig = ethers.utils.splitSignature(signedMessage);
		const wrapTx = await libWrapperContract.wrapWithSignature(hashedMessage, sig.v, sig.r, sig.s, userAddress,  {value: wrapValue})
    setFetching(true);
    setTransactionHash(wrapTx.hash)

    const receipt = await wrapTx.wait();
    if(receipt.status !== 1) {
      alert("Transaction failed");
    }

    showNotification(`Successfully converted ${value} ETH to ${value} LIB!`);

    await updateBalances();
    setFetching(false);
  };

  const borrowWithSignature = async (title: string, message: string = "") => {
    try {
      const balance = ethers.utils.parseEther(userLibBalance);
      const rentFeeBN = ethers.utils.parseEther(rentFee);
      if (balance >= rentFeeBN) {
        if (books.filter(b => b.Title === title).length) {
          const [hashedMessage, signedMessage] = await signMessage(message);
          const sig = ethers.utils.splitSignature(signedMessage);
          console.log(sig);
          const approveTx = await tokenContract.approve(libraryContract.address, rentFeeBN);
          setFetching(true);
          setTransactionHash(approveTx.hash)
          const approveTxReceipt = await approveTx.wait();
          if (approveTxReceipt.status !== 1) {
            alert(`Approval to spend ${rentFee} LIB failed`);
          } else {
            const borrowTx = await libraryContract.borrowBookWithSignature(title, hashedMessage, sig.v, sig.r, sig.s, userAddress);
            setTransactionHash(borrowTx.hash);
            const borrowTxReceipt = await borrowTx.wait();
            if(borrowTxReceipt.status !== 1) {
              alert("Borrowing failed");
            }
            await updateBalances();
          }
        }
        setFetching(false);
        setTransactionHash("")
      } else {
        alert("Insufficient LIB to borrow book");
      }
    } catch(err) {
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }
  };

  const borrowOnBehalfOfSignature = async (title: string, signature: string, receiverAddress: string, message: string = "") => {
    try {
      if (receiverAddress && signature) {
        const isValidAddress = ethers.utils.isAddress(receiverAddress);
        if (isValidAddress) {
          const balance = ethers.utils.parseEther(userLibBalance);
          const rentFeeBN = ethers.utils.parseEther(rentFee);
          if (balance >= rentFeeBN) {
            if (books.filter(b => b.Title === title).length) {
              const sig = ethers.utils.splitSignature(signature);
              const hashedMessage = ethers.utils.solidityKeccak256(['string'], [message]);
              console.log(sig);
              const approveTx = await tokenContract.approve(libraryContract.address, rentFeeBN);
              setFetching(true);
              setTransactionHash(approveTx.hash)
              const approveTxReceipt = await approveTx.wait();
              if (approveTxReceipt.status !== 1) {
                alert(`Approval to spend ${rentFee} LIB failed`);
              } else {
                const borrowTx = await libraryContract.borrowOnBehalfOf(title, hashedMessage, sig.v, sig.r, sig.s, receiverAddress);
                setTransactionHash(borrowTx.hash);
                const borrowTxReceipt = await borrowTx.wait();
                if(borrowTxReceipt.status !== 1) {
                  alert("Borrowing failed");
                }
                await updateBalances();
              }
            }
            setFetching(false);
            setTransactionHash("")
          } else {
            alert("Invalid receiver address");
          }
        } else {
          alert("Insufficient LIB to borrow book");
        }
      } else {
        alert("Empty receiver signature and/or receiver address")
      }
    } catch(err) {
      setFetching(false);
      setTransactionHash("");
      alert("Transaction failed");
    }
  };

  const signMessage = async (messageToSign: string) => {
    const signer = web3Library.getSigner();
    const messageHash = ethers.utils.solidityKeccak256(['string'], [messageToSign]);
    const arrayfiedHash = ethers.utils.arrayify(messageHash);
    const signedMessage = await signer.signMessage(arrayfiedHash);

    return [messageHash, signedMessage];
  }

  const onAttemptToApprove = async () => {
    try {
      const nonce = (await tokenContract.nonces(userAddress)); // Our Token Contract Nonces
      const deadline = + new Date() + 60 * 60; // Permit with deadline which the permit is valid
      const wrapValue = ethers.utils.parseEther(rentFee); // Value to approve for the spender to use
  
      const EIP712Domain = [ // array of objects -> properties from the contract and the types of them ircwithPermit
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'verifyingContract', type: 'address' }
      ];
  
      const domain = {
        name: await tokenContract.name(),
        version: '1',
        verifyingContract: tokenContract.address
      };
  
      const Permit = [ // array of objects -> properties from erc20withpermit
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' }
      ];
  
      const message = {
        owner: userAddress,
        spender: LIBRARY_CONTRACT_ADDRESS,
        value: wrapValue.toString(),
        nonce: nonce.toHexString(),
        deadline
      };
  
      const data = JSON.stringify({
        types: {
            EIP712Domain,
            Permit
        },
        domain,
        primaryType: 'Permit',
        message
      })
  
      const signatureLike = await web3Library.send('eth_signTypedData_v4', [userAddress, data]);
      const signature = await ethers.utils.splitSignature(signatureLike)
  
      const preparedSignature = {
        v: signature.v,
        r: signature.r,
        s: signature.s,
        deadline
      }
      return preparedSignature;
    } catch(err) {
      alert("Creating signature failed");
      return null
    }
  }

  const recoverAddressBeforePermit = async (preparedSignature: any, message: any) => {
    const {owner, spender, value, nonce} = message;
    const { v, r, s, deadline } = preparedSignature;
  
    const domainSeparator = await tokenContract.DOMAIN_SEPARATOR();
    const permitTypehash = await tokenContract.PERMIT_TYPEHASH();
    const noncePlus = nonce + 1;
    const digest = buildDigest(domainSeparator, permitTypehash, owner, spender, value, noncePlus, deadline);
    const hashedDigest = toBuffer(digest);
    const recoveredAddress = ecrecover(hashedDigest, v, r, s);
    
    const recAddressString = bufferToHex(pubToAddress(recoveredAddress));
    return recAddressString === userAddress;
  }


  const buildDigest = (domainSeparator: any, permitTypehash: any, owner:any, spender: any, value: any, nonce: any, deadline: any) =>  {
    const messagePart = keccak256(['string'],[
      abiCoder.encode(['string', 'string', 'string', 'string', 'string', 'string', ],[
        permitTypehash,
        owner,
        spender,
        value,
        nonce,
        deadline
      ])
    ]);
    
    const digest = keccak256(['string'], [
      abiCoder.encode(['string', 'string', 'string'], [
        `\x19\x01`,
        domainSeparator,
        messagePart
        ])
      ]);

    return digest;
  }

  const formatToken = (wei: BigNumberish, decimals: number = 18) => {
    return ethers.utils.formatUnits(wei, decimals);
  }

  return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={userAddress}
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
                      // borrowBook={borrowBook}
                      borrowBook={borrowBookWithPermit}
                      // borrowBook={borrowWithSignature}
                      borrowOnBehalfOf={borrowOnBehalfOfSignature}
                      fetchBooks={fetchBooks}
                      submitBook={submitBook}
                      handleChange={handleChange}
                      bookInfo={newBookInfo}
                      returnBook={returnBook}
                      fetchingBooks={fetchingBooks}
                      tokenBalance={userLibBalance}
                      convertEthToLib={wrapWithSignature}
                      withdrawLIB={withdrawLIB}
                      contractBalance={contractBalance}
                      rentFee={rentFee}
                      signMessage={signMessage}
                      withdrawRent={withdrawRent}
                    />
                  </SLanding>
              }
            </SContent>
        </Column>
      </SLayout>
  );
}

export default App;
