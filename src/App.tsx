import * as React from 'react';
import styled from 'styled-components';

import Web3Modal from 'web3modal';
// @ts-ignore
import WalletConnectProvider from '@walletconnect/web3-provider';
import Column from './components/Column';
import Wrapper from './components/Wrapper';
import Header from './components/Header';
import Loader from './components/Loader';
import ConnectButton from './components/ConnectButton';
import ElectionDashboard from './components/ElectionDashboard';

import { Web3Provider } from '@ethersproject/providers';
import { getChainData } from './helpers/utilities';
import { getContract } from './helpers/ethers';

import {
  US_ELECTION_ADDRESS,
} from './constants';

import US_ELECTION from "./constants/abis/USElection.json"

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

interface IAppState {
  fetching: boolean;
  address: string;
  library: any;
  connected: boolean;
  chainId: number;
  pendingRequest: boolean;
  result: any | null;
  electionContract: any | null;
  info: any | null;
  currentLeader: number;
  transactionHash: string;
  bidenSeats: number;
  trumpSeats: number;
  hasElectionEnded: boolean;
}

const INITIAL_STATE: IAppState = {
  fetching: false,
  address: '',
  library: null,
  connected: false,
  chainId: 1,
  pendingRequest: false,
  result: null,
  electionContract: null,
  info: null,
  currentLeader: 0,
  transactionHash: "",
  bidenSeats: 0,
  trumpSeats: 0,
  hasElectionEnded: false
};

class App extends React.Component<any, any> {
  // @ts-ignore
  public web3Modal: Web3Modal;
  public state: IAppState;
  public provider: any;

  constructor(props: any) {
    super(props);
    this.state = {
      ...INITIAL_STATE
    };

    this.web3Modal = new Web3Modal({
      network: this.getNetwork(),
      cacheProvider: true,
      providerOptions: this.getProviderOptions()
    });
  }

  public componentDidMount() {
    if (this.web3Modal.cachedProvider) {
      this.onConnect();
    }
  }

  public onConnect = async () => {

    this.provider = await this.web3Modal.connect();

    const library = new Web3Provider(this.provider);

    const network = await library.getNetwork();

    const address = this.provider.selectedAddress ? this.provider.selectedAddress : this.provider?.accounts[0];

    const electionContract = getContract(US_ELECTION_ADDRESS, US_ELECTION.abi, library, address);

    const hasElectionEnded = await electionContract.electionEnded();
    const bidenSeats = await electionContract.seats(1);
    const trumpSeats = await electionContract.seats(2);

    console.log(bidenSeats);
    console.log(trumpSeats);
    console.log(hasElectionEnded);

    await this.setState({
      library,
      chainId: network.chainId,
      address,
      connected: true,
      electionContract,
      hasElectionEnded,
      bidenSeats,
      trumpSeats
    });

    await this.subscribeToProviderEvents(this.provider);

    await this.getCurrentLeader();

  };

  public subscribeToProviderEvents = async (provider: any) => {
    if (!provider.on) {
      return;
    }

    provider.on("accountsChanged", this.changedAccount);
    provider.on("networkChanged", this.networkChanged);
    provider.on("close", this.close);

    await this.web3Modal.off('accountsChanged');
  };

  public async unSubscribe(provider: any) {
    // Workaround for metamask widget > 9.0.3 (provider.off is undefined);
    window.location.reload(false);
    if (!provider.off) {
      return;
    }

    provider.off("accountsChanged", this.changedAccount);
    provider.off("networkChanged", this.networkChanged);
    provider.off("close", this.close);
  }

  public changedAccount = async (accounts: string[]) => {
    if (!accounts.length) {
      // Metamask Lock fire an empty accounts array 
      await this.resetApp();
    } else {
      await this.setState({ address: accounts[0] });
    }
  }

  public networkChanged = async (networkId: number) => {
    const library = new Web3Provider(this.provider);
    const network = await library.getNetwork();
    const chainId = network.chainId;
    await this.setState({ chainId, library });
  }

  public close = async () => {
    this.resetApp();
  }

  public getNetwork = () => getChainData(this.state.chainId).network;

  public getProviderOptions = () => {
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

  public resetApp = async () => {
    await this.web3Modal.clearCachedProvider();
    localStorage.removeItem("WEB3_CONNECT_CACHED_PROVIDER");
    localStorage.removeItem("walletconnect");
    await this.unSubscribe(this.provider);

    this.setState({ ...INITIAL_STATE });
  };

  public getCurrentLeader = async () => {
    const { electionContract } = this.state;

    const currentLeader = await electionContract.currentLeader();
    const bidenSeats = await electionContract.seats(1);
    const trumpSeats = await electionContract.seats(2);

    await this.setState({ currentLeader, bidenSeats, trumpSeats });
  };

  public submitElectionResult = async (state: string, votesBiden: number, votesTrump: number, seats: number) => {
    const { electionContract } = this.state;

    const dataArr = [
      state,
      votesBiden,
      votesTrump,
      seats,
    ];

    try {
      await this.setState({ fetching: true });
      const transaction = await electionContract.submitStateResult(dataArr);
      console.log(transaction.hash);
      await this.setState({ transactionHash: transaction.hash });

      const transactionReceipt = await transaction.wait();
      if (transactionReceipt.status !== 1) {
        console.log(transactionReceipt);
        alert("Transaction failed");
      }
      await this.getCurrentLeader();
      await this.setState({ fetching: false, transactionHash: "" });
    } catch (err) {
      console.log(err);
      await this.setState({ fetching: false, transactionHash: "" });
      alert("Transaction failed");
    }

  };

  public endElection = async () => {
    const { electionContract } = this.state;

    await this.setState({ fetching: true });

    await electionContract.endElection();

    await this.setState({ fetching: false, hasElectionEnded: true });
  }

  public render = () => {
    const {
      address,
      connected,
      chainId,
      fetching,
      transactionHash
    } = this.state;

    return (
      <SLayout>
        <Column maxWidth={1000} spanHeight>
          <Header
            connected={connected}
            address={address}
            chainId={chainId}
            killSession={this.resetApp}
          />
          <SContent>
            {fetching ? (
              <Column center>
                <SContainer>
                  <Loader transactionHash={transactionHash} />
                </SContainer>
              </Column>
            ) :
              !this.state.connected ?
                <SLanding center>
                  <ConnectButton onClick={this.onConnect} />
                </SLanding> :
                <SLanding>
                  <ElectionDashboard
                    getCurrentLeader={this.getCurrentLeader}
                    submitElectionResults={this.submitElectionResult}
                    endElection={this.endElection}
                    currentLeader={this.state.currentLeader}
                    bidenSeats={this.state.bidenSeats}
                    trumpSeats={this.state.trumpSeats}
                    hasElectionEnded={this.state.hasElectionEnded}
                  />
                </SLanding>
            }
          </SContent>
        </Column>
      </SLayout>
    );
  };
}

export default App;
