import { title } from "process";
import * as React from "react";
import { useState } from "react";
import IBook from "src/models/interfaces/IBook";
import styled from "styled-components";
import Button from "./Button";
import Loader from "./Loader";

interface IBookLibraryProps {
  books: IBook[];
  borrowBook: (title: string) => void;
  fetchBooks: () => void;
  submitBook: () => void
  handleChange: (e: any) => void;
  returnBook: (title: string) => void;
  bookInfo: IBook;
  fetchingBooks: boolean;
  tokenBalance: string;
  convertEthToLib: () => void;
  withdrawLIB: () => void;
  contractLibBalance: string;
  contractEthBalance: string;
  rentFee: string;
  signMessage: (message: string) => void;
  borrowOnBehalfOf: (name: string, signature: string, receiverAddress: string) => void;
  withdrawRent: () => void;
  withdrawRentToOwnerAccount: () => void
}
enum JustifyContent {
  Center = "center",
  Start = "start",
  End = "end",
  FlexStart = "flex-start",
  FlexEnd = "flex-end",
  Left = "left",
  Right = "right",
  Normal = "normal",
  SpaceBetween = "space-between",
  SpaceAround = "space-around",
  SpaceEvenly = "space-evenly",
  Stretch = "strech"
}

interface ISContainerProps {
  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;
  flexDirection?: string;
  justifyContent?: JustifyContent
  alignItems?: string;
}

interface ISHeaderProps {
  fontSize?: string;
}

const BookLibrary = (props: IBookLibraryProps) => {
  const [showAddBookScreen, setShowAddBookScreen] = useState<boolean>(false);
  const [receiverSignature, setReceiverSignature] = useState<string>("");
  const [receiverAddress, setReceiverAddress] = useState<string>("");

  const SContainer = styled.div<ISContainerProps>`
    display:flex;
    width:100%;
    flex-direction: ${({flexDirection}) => flexDirection ? flexDirection : "row"};
    justify-content: ${({justifyContent}) => justifyContent ? justifyContent : "normal"};
    margin-top: ${({marginTop}) => marginTop ? marginTop : 0}
    margin-bottom: ${({marginBottom}) => marginBottom? marginBottom: 0}
    margin-left: ${({marginLeft}) => marginLeft? marginLeft : 0}
    margin-right: ${({marginRight}) => marginRight? marginRight : 0}
    align-items: ${({alignItems}) => alignItems ? alignItems : "normal"}
  `

  const SHeaderDiv = styled.div<ISHeaderProps>`
    font-size: ${({fontSize}) => fontSize ? fontSize : "20px"};
    font-weight: bold;
  `

  const SInput = styled.input`
    margin: 0 5px;
    border-radius: 5px;
  `
  const STable = styled.table`
    width: 100%;
  `
  return (
    <>
      <SContainer justifyContent={JustifyContent.SpaceBetween} marginTop={"5px"}>
        <SHeaderDiv fontSize="25px">dBook Library</SHeaderDiv>
        <Button 
          width={"30%"} 
          onClick={props.fetchBooks}
        >
          Refresh books
        </Button>
        <Button 
          width={"30%"}
          onClick={() => setShowAddBookScreen(!showAddBookScreen)}
        >
          {showAddBookScreen ? "View dashboard" : "Add book"}
        </Button>
      </SContainer>
      <SContainer marginTop={"10px"}  marginBottom={"10px"}>
        <SHeaderDiv>
          Rent fee: {props.rentFee} LIB
        </SHeaderDiv>
      </SContainer>
      <SContainer justifyContent={JustifyContent.SpaceBetween} marginBottom={"10px"}>
          <SContainer justifyContent={JustifyContent.SpaceBetween}>
            <SHeaderDiv>
              User Balance: {props.tokenBalance} LIB
            </SHeaderDiv>
            <Button width={"30%"} onClick={props.convertEthToLib}>
              Convert ETH to LIB 
            </Button>
            <Button width={"30%"} onClick={props.withdrawLIB}>
              Convert LIB to ETH
            </Button>
          </SContainer>
      </SContainer>
      <SContainer justifyContent={JustifyContent.SpaceBetween}  marginBottom={"10px"}>
          <SHeaderDiv>
            Contract balance: {props.contractLibBalance} LIB
          </SHeaderDiv>
          <Button onClick={props.withdrawRent}>
            Withdraw from accumulated rent
          </Button>
      </SContainer>
      <SContainer justifyContent={JustifyContent.SpaceBetween}  marginBottom={"10px"}>
          <SHeaderDiv>
            Contract balance: {props.contractEthBalance} ETH
          </SHeaderDiv>
          <Button onClick={props.withdrawRentToOwnerAccount}>
            Withdraw ETH to owner account
          </Button>
      </SContainer>
      <SContainer justifyContent={JustifyContent.SpaceEvenly}>
        {
          !showAddBookScreen 
          ? props.books.length && !props.fetchingBooks
          ? <STable>
              <tbody>
                <tr>
                  <th>Available Books</th>
                  <th>Copies left</th>
                  <th>Actions</th>
                </tr>
                {props.books.map(((book: IBook, idx: number) => (
                  <tr key={idx}>
                    <td>{book.Title}</td>
                    <td>{book.Copies}</td>
                    <td style={{alignItems: "center"}}>
                      <SContainer alignItems={"center"} flexDirection={"column"} justifyContent={JustifyContent.Center}>
                        {book.IsBorrowed
                        ?
                        <Button width={"80%"}
                        onClick={() => {props.returnBook(book.Title)}}
                      >
                        Return
                      </Button>
                        :
                        <SContainer alignItems={"center"} flexDirection={"column"}>
                          <Button color="green" width={"80%"}
                            onClick={() => {props.borrowBook(book.Title)}}
                          >
                            Borrow for yourself
                          </Button>
                          <SInput 
                            style={{width: "80%", marginBottom: "5px"}}
                            onChange={(e) => setReceiverSignature(e.target.value)}
                            value={receiverSignature}
                            placeholder={"Insert signature of receiver"}
                          />
                          <SInput 
                            style={{width: "80%", marginBottom: "5px"}}
                            onChange={(e) => setReceiverAddress(e.target.value)}
                            value={receiverAddress}
                            placeholder={"Insert address receiver"}
                          />
                          <Button color="green" width={"80%"} onClick={() => props.borrowOnBehalfOf(book.Title, receiverSignature, receiverAddress)}>
                            Borrow on behalf of
                          </Button>
                        </SContainer>
                        }
                      </SContainer>
                    </td>
                  </tr>
                )))}
              </tbody>
            </STable> 
          : <SHeaderDiv>
            {
              props.fetchingBooks
              ? 
               <SContainer>
                  <Loader  />
                </SContainer>
              : "There aren't any available books at the moment"
            }
          </SHeaderDiv>
          :
            <SContainer justifyContent={JustifyContent.SpaceEvenly}>
                <SInput 
                  key="title"
                  name="Title"
                  value={props.bookInfo.Title} 
                  onChange={props.handleChange}
                />
                <SInput 
                  key="copies"
                  name="Copies"
                  value={props.bookInfo.Copies} 
                  onChange={props.handleChange}
                  type="number"
                />
                <Button  
                  onClick={props.submitBook}
                >
                  Create book
                </Button>
            </SContainer>
        }
      </SContainer>
    </>
  );
}

export default BookLibrary;