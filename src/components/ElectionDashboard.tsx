import React, { useState } from "react"
import Button from "./Button"

import styled from 'styled-components';
import Column from "./Column";
import Candidates from "src/constants/Candidates";

interface IElectionDashboardProps {
  endElection: () => void;
  getCurrentLeader: () => void;
  submitElectionResults: (state?: string, bidenVotes?: number, trumpVotes?: number, seats?: number) => void;
  currentLeader: number;
  trumpSeats: number;
  bidenSeats: number;
  hasElectionEnded: boolean;
}

const FlexVerticalDiv = styled.div`
  margin-top: -1px;
  margin-bottom: 1px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-direction: column;
  padding: 0 16px;
`

const SContainer = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin: 0 20px;
  margin: 10px 0;
`
const SBoldDiv = styled.div`
  font-weight: bold;
  font-size: 19px;
`

const SInput = styled.input`
  margin: 0 5px;
  border-radius: 5px;
`

const ElectionDashboard = (props: IElectionDashboardProps) => {
  const { getCurrentLeader, submitElectionResults, currentLeader, trumpSeats, bidenSeats, endElection, hasElectionEnded } = props;

  const [state, setState] = useState<string>("");
  const [votesBiden, setVotesBiden] = useState<number>(0);
  const [votesTrump, setVotesTrump] = useState<number>(0);
  const [seats, setSeats] = useState<number>(0);

  const leaderName = currentLeader === 0 ? Candidates.TIE : currentLeader === 1 ? Candidates.BIDEN : Candidates.TRUMP;

  return (
    <>
      <SContainer>
        <FlexVerticalDiv>
          Biden seats
          <SBoldDiv>
            {bidenSeats}
          </SBoldDiv>
        </FlexVerticalDiv>
        <FlexVerticalDiv>
          Trump seats
          <SBoldDiv>{
          trumpSeats}
        </SBoldDiv>
        </FlexVerticalDiv>
        <FlexVerticalDiv>
          Current leader
          <SBoldDiv>
            {leaderName}
          </SBoldDiv>
        </FlexVerticalDiv>
        <FlexVerticalDiv>
          Election state
          <SBoldDiv>
            {hasElectionEnded ? "FINISHED" : "ONGOING"}
          </SBoldDiv>
        </FlexVerticalDiv>
      </SContainer>
      <SContainer>
        <Column>
          <div>State</div>
          <SInput value={state} onChange={(e) => setState(e.target.value)} />
        </Column>
        <Column>
          <div>Votes for Biden</div>
          <SInput type="number" value={votesBiden} onChange={(e) => setVotesBiden(+e.target.value)} />
        </Column>
        <Column>
          <div>Votes for Trump</div>
          <SInput type="number" value={votesTrump} onChange={(e) => setVotesTrump(+e.target.value)} />
        </Column>
        <Column>
          <div>Seats</div>
          <SInput type="number" value={seats} onChange={(e) => setSeats(+e.target.value)} />
        </Column>
      </SContainer>
      <SContainer>
        <Button color="red" onClick={endElection}>End election</Button>
        <Button onClick={getCurrentLeader}>Refresh results</Button>
        <Button color="green" onClick={() => submitElectionResults(state, votesBiden, votesTrump, seats)}>Submit results</Button>

      </SContainer>
    </>

  )
}

export default ElectionDashboard;