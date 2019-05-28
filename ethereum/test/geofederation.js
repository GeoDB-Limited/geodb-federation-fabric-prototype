const GeoToken = artifacts.require("GeoToken.sol");
const GeoFederation = artifacts.require("GeoFederation.sol");

const { fundPartnersWithGeoTokens, addMembersToFederation } = require("./helpers");

const { initialMinimumFederationStake, initialFundingForPartners } = require("./helpers/geoconstants");
const ErrorMsgs = require("./helpers/errorMessages.js");

const { BN, expectEvent, shouldFail } = require("openzeppelin-test-helpers");

contract("GeoFederation", ([_, geodb, presaleHolder, partner, partner2, emptyAccount, ...accounts]) => {
  beforeEach("Deploy token contract and federation contract", async () => {
    this.token = await GeoToken.new([presaleHolder], [initialMinimumFederationStake], { from: geodb });

    this.federation = await GeoFederation.new(this.token.address, {
      from: geodb
    });

    this.token.transferOwnership(this.federation.address, { from: geodb });

    await this.token.approve(this.federation.address, initialMinimumFederationStake, {
      from: geodb
    });

    await this.federation.increaseStake(initialMinimumFederationStake, {
      from: geodb
    });

    await fundPartnersWithGeoTokens(
      initialMinimumFederationStake.mul(new BN("10")),
      geodb,
      [partner, partner2],
      this.token
    );
  });

  describe("Contract initialization", () => {
    it("signs GeoDB as first federation member", async () => {
      const federationStake = await this.federation.federationStakes(geodb);

      federationStake.stake.should.be.bignumber.equal(initialMinimumFederationStake);
      federationStake.approved.should.be.equal(true);
    });

    it("has balance assigned to the federation", async () => {
      (await this.token.balanceOf(this.federation.address)).should.be.bignumber.equal(initialMinimumFederationStake);
    });

    it("transfers ownership to the federation contract", async () => {
      const owner = await this.token.owner();
      owner.should.be.equal(this.federation.address);
    });
  });

  describe("Federation join process", () => {
    describe("When creating a ballot", () => {
      describe("With sufficient funds", () => {
        let newJoinBallotLogs;

        beforeEach("Approve transfer and create ballot", async () => {
          await this.token.approve(this.federation.address, initialMinimumFederationStake, { from: partner });
          const { logs } = await this.federation.newJoinBallot(initialMinimumFederationStake, { from: partner });
          newJoinBallotLogs = logs;
        });

        it("allows to make a new join ballot", async () => {
          const event = expectEvent.inLogs(newJoinBallotLogs, "LogNewJoinBallot", { sender: partner });

          event.args.stake.should.be.bignumber.equal(initialMinimumFederationStake);

          (await this.token.balanceOf(this.federation.address)).should.be.bignumber.equal(
            initialMinimumFederationStake.mul(new BN("2"))
          );

          (await this.token.balanceOf(partner)).should.be.bignumber.equal(
            initialFundingForPartners.sub(initialMinimumFederationStake)
          );
        });

        it("allows to vote the ballot", async () => {
          const { tx, logs } = await this.federation.voteJoinBallot(partner, { from: geodb });

          const event = expectEvent.inLogs(logs, "LogVoteJoinBallot", { sender: geodb, ballot: partner });

          event.args.voteWeight.should.be.bignumber.equal(initialMinimumFederationStake);
          event.args.approvals.should.be.bignumber.equal(initialMinimumFederationStake);
        });

        it("resolves ballot positively if there is quorum", async () => {
          await this.federation.voteJoinBallot(partner, { from: geodb });

          const { tx, logs } = await this.federation.resolveJoinBallot({ from: partner });

          expectEvent
            .inLogs(logs, "LogNewMember", { sender: partner })
            .args.stake.should.be.bignumber.equal(initialMinimumFederationStake);

          expectEvent.inLogs(logs, "LogResolveJoinBallot", { sender: partner }).args.result.should.be.equal(true);

          (await this.federation.isFederated(partner)).should.be.equal(true);
        });

        it("resolves ballot negatively and retrieves stake if there is no quorum", async () => {
          const { tx, logs } = await this.federation.resolveJoinBallot({ from: partner });

          expectEvent.inLogs(logs, "LogResolveJoinBallot", { sender: partner }).args.result.should.be.equal(false);

          (await this.federation.isFederated(partner)).should.be.equal(false);

          (await this.token.balanceOf(this.federation.address)).should.be.bignumber.equal(
            initialMinimumFederationStake
          );
        });

        describe("When the deadline has passed", () => {
          it("rejects votes", async () => {
            const delta = 2 * 24 * 3600;

            await web3.currentProvider.send(
              { jsonrpc: "2.0", method: "evm_increaseTime", params: [delta], id: 123 },
              (err, result) => {
                if (err) {
                  console.error(err);
                  return;
                }
              }
            );

            await shouldFail.reverting.withMessage(
              this.federation.voteJoinBallot(partner, { from: geodb }),
              ErrorMsgs.deadlineHasPassed
            );
          });
        });

        describe("When double voting", () => {
          it("rejects votes", async () => {
            await this.federation.voteJoinBallot(partner, { from: geodb });
            await shouldFail.reverting.withMessage(
              this.federation.voteJoinBallot(partner, { from: geodb }),
              ErrorMsgs.cannotVoteTwice
            );
          });
        });

        describe("When double resolving", () => {
          it("rejects transaction", async () => {
            await this.federation.voteJoinBallot(partner, { from: geodb });
            await this.federation.resolveJoinBallot({ from: partner });
            await shouldFail.reverting.withMessage(
              this.federation.resolveJoinBallot({ from: partner }),
              ErrorMsgs.thisBallotHasAlreadyBeenResolved
            );
          });
        });
      });

      describe("Without sufficient funds", () => {
        it("rejects ballot creation", async () => {
          await shouldFail.reverting.withMessage(
            this.federation.newJoinBallot(initialMinimumFederationStake, { from: emptyAccount }),
            ErrorMsgs.safeMathSubstractionOverflow
          );
        });
      });
    });
  });

  describe("Federation exit process", () => {
    describe("When caller is federated", () => {
      let newExitBallotLogs;

      beforeEach("Add partners to federation and create ballot", async () => {
        const voters = await addMembersToFederation(
          [geodb],
          [partner, partner2],
          initialMinimumFederationStake,
          this.token,
          this.federation
        );

        const { logs } = await this.federation.newExitBallot({ from: partner });
        newExitBallotLogs = logs;
      });

      it("allows to create the ballot", async () => {
        const event = expectEvent.inLogs(newExitBallotLogs, "LogNewExitBallot", { sender: partner });

        const ballot = await this.federation.federationExitBallots(partner);
        ballot.approvals.should.be.bignumber.equal(initialMinimumFederationStake);
      });

      describe("When voting the exit ballot", () => {
        it("should add votes and stake of federated members", async () => {
          const { logs } = await this.federation.voteExitBallot(partner, { from: geodb });

          const event = expectEvent.inLogs(logs, "LogVoteExitBallot", { sender: geodb });

          const ballot = await this.federation.federationExitBallots(partner);
          ballot.approvals.should.be.bignumber.equal(initialMinimumFederationStake.mul(new BN("2")));
        });
        it("should reject votes of non federated members", async () => {
          await shouldFail.reverting.withMessage(
            this.federation.voteExitBallot(partner, { from: emptyAccount }),
            ErrorMsgs.callerMustBeFederated
          );
        });
        it("should reject votes if the deadline has passed", async () => {
          const delta = 2 * 24 * 3600;

          await web3.currentProvider.send(
            { jsonrpc: "2.0", method: "evm_increaseTime", params: [delta], id: 123 },
            (err, result) => {
              if (err) {
                console.error(err);
                return;
              }
            }
          );

          await shouldFail.reverting.withMessage(
            this.federation.voteExitBallot(partner, { from: geodb }),
            ErrorMsgs.deadlineHasPassed
          );
        });
        it("should reject votes if the ballot has been resolved", async () => {
          await this.federation.voteExitBallot(partner, { from: geodb });
          await this.federation.resolveExitBallot({ from: partner });

          await shouldFail.reverting.withMessage(
            this.federation.voteExitBallot(partner, { from: partner2 }),
            ErrorMsgs.thisBallotHasAlreadyBeenResolved
          );
        });
      });

      describe("When resolving the exit ballot", () => {
        it("should allow to exit and retrieve stake if ballot was resolved positively", async () => {
          await this.federation.voteExitBallot(partner, { from: geodb });

          const { logs } = await this.federation.resolveExitBallot({ from: partner });

          expectEvent.inLogs(logs, "LogResolveExitBallot", { sender: partner }).args.result.should.be.equal(true);
          expectEvent
            .inLogs(logs, "LogMemberExit", { sender: partner })
            .args.stake.should.be.bignumber.equal(initialMinimumFederationStake);

          const partnerFederationStake = await this.federation.federationStakes(partner);

          partnerFederationStake.approved.should.be.equal(false);
          partnerFederationStake.stake.should.be.bignumber.equal(new BN("0"));

          (await this.token.balanceOf(this.federation.address)).should.be.bignumber.equal(
            initialMinimumFederationStake.mul(new BN("2"))
          );

          (await this.token.balanceOf(partner)).should.be.bignumber.equal(initialFundingForPartners);

          (await this.federation.isFederated(partner)).should.be.equal(false);
        });
        it("should end the vote and make no changes if ballot was resolved negatively", async () => {
          const { logs } = await this.federation.resolveExitBallot({ from: partner });

          expectEvent.inLogs(logs, "LogResolveExitBallot", { sender: partner }).args.result.should.be.equal(false);
        });
        it("should reject trying to resolve the ballot twice");
        it("should reject trying to resolve the ballot when the deadline has passed");
      });

      describe("After resolving a ballot positively", () => {
        it("should allow to rejoin the federation with a join ballot");
      });
    });

    describe("When caller is not federated", () => {
      it("rejects creating ballot");
    });
  });

  describe("Token - Federation contract interaction", () => {
    it("allows token minting from federation", async () => {
      const { tx, logs } = await this.federation.releaseReward(accounts[0], "100", { from: geodb });
    });
  });
});
