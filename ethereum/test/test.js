const assert = require("assert");
const ganache = require("ganache-cli");
const ethers = require("ethers");
const EthersUtils = require("ethers").utils;
const Web3Utils = require("web3-utils");

const { setupNetwork } = require("./helpers/setupNetwork");

// ###################
// # ETHEREUM SETUP
// ###################

let accounts, ethersProvider;

// ###################
// # SMART CONTRACT
// ###################

const compiledGeoDBRoot = require("../build/contracts/GeoDB.json");
const errorMsgs = require("./helpers/errorMessages");

let rootSmartContract;
let contractProxy = {};
let stakeRequirement = 0;

// ###################
// # BALANCES
// ###################

let oldBalances = {};

// ###################
// # TESTING
// ###################

describe("Top", () => {
  before("Setup ethereum network", () => {
    let setup = setupNetwork();
    ethersProvider = setup.ethersProvider;
    accounts = setup.accounts;
  });

  describe("Basic staking test", () => {
    before("Contract deployment", async () => {
      let factory = new ethers.ContractFactory(
        compiledGeoDBRoot.abi,
        compiledGeoDBRoot.bytecode,
        accounts["geodb"]
      );

      rootSmartContract = await factory.deploy();
      await rootSmartContract.deployed();

      assert.ok(
        rootSmartContract.address && rootSmartContract.deployTransaction.hash,
        "Contract could not be deployed"
      );
      stakeRequirement = (await rootSmartContract.getCurrentFederationStakeRequirement()).toNumber();

      contractProxy["geodb"] = rootSmartContract.connect(accounts["geodb"]);
      contractProxy["org1"] = rootSmartContract.connect(accounts["org1"]);
      contractProxy["org2"] = rootSmartContract.connect(accounts["org2"]);
      contractProxy["org3"] = rootSmartContract.connect(accounts["org3"]);

      await (await contractProxy["geodb"].transfer(
        accounts["org1"].address,
        stakeRequirement
      )).wait();
      await (await contractProxy["geodb"].transfer(
        accounts["org2"].address,
        stakeRequirement
      )).wait();
      await (await contractProxy["geodb"].transfer(
        accounts["org3"].address,
        stakeRequirement
      )).wait();
    });

    beforeEach("Update organizations balance", async () => {
      oldBalances[
        "contract"
      ] = (await rootSmartContract.totalStake()).toNumber();
      oldBalances["geodb"] = (await rootSmartContract.balanceOf(
        accounts["geodb"].address
      )).toNumber();
      oldBalances["org1"] = (await rootSmartContract.balanceOf(
        accounts["org1"].address
      )).toNumber();
      oldBalances["org2"] = (await rootSmartContract.balanceOf(
        accounts["org2"].address
      )).toNumber();
      oldBalances["org3"] = (await rootSmartContract.balanceOf(
        accounts["org3"].address
      )).toNumber();
    });

    it("allows to stake if sender has enough GEOs", async () => {
      const tx = await contractProxy["org1"].federationStakeLock(
        stakeRequirement
      );
      const result = await tx.wait();

      const contractBalance = await contractProxy["org1"].totalStake();

      const org1Balance = await contractProxy["org1"].balanceOf(
        accounts["org1"].address
      );

      const contractBalanceDelta =
        contractBalance.toNumber() - oldBalances["contract"];

      const org1BalanceDelta = org1Balance.toNumber() - oldBalances["org1"];

      assert.ok(
        Web3Utils.isHexStrict(result.transactionHash),
        "Transaction did not go through"
      );

      assert.equal(
        contractBalanceDelta,
        stakeRequirement,
        `Balance delta did not match. Actual: ${contractBalanceDelta}, Expected: ${stakeRequirement}`
      );

      assert.equal(
        org1BalanceDelta,
        -stakeRequirement,
        `Balance delta did not match. Actual: ${contractBalanceDelta}, Expected: ${-stakeRequirement}`
      );
    });

    // it("allows to withdraw the stake");

    it("allows to make a withdrawal request", async () => {
      const tx = await contractProxy["geodb"].requestStakeWithdrawal();
      const result = await tx.wait();

      assert.ok(
        Web3Utils.isHexStrict(result.transactionHash),
        "Transaction did not go through"
      );
    });

    it("allows to release rewards", async () => {
      const tx = await contractProxy["geodb"].releaseRewards(
        accounts["org1"].address,
        stakeRequirement
      );
      const result = await tx.wait();

      const org1Balance = (await rootSmartContract.balanceOf(
        accounts["org1"].address
      )).toNumber();

      const org1BalanceDelta = org1Balance - oldBalances["org1"];

      assert.ok(
        Web3Utils.isHexStrict(result.transactionHash),
        "Transaction did not go through"
      );

      assert.equal(
        org1BalanceDelta,
        stakeRequirement,
        `Balance delta did not match. Actual: ${org1BalanceDelta}, Expected: ${stakeRequirement}`
      );
    });

    it("allows to withdraw the stake", async () => {
      const tx = await contractProxy["geodb"].federationStakeWithdraw();
      const result = await tx.wait();

      const contractBalance = await contractProxy["geodb"].totalStake();

      const geodbBalance = await contractProxy["geodb"].balanceOf(
        accounts["geodb"].address
      );

      const contractBalanceDelta =
        contractBalance.toNumber() - oldBalances["contract"];

      const geodbBalanceDelta = geodbBalance.toNumber() - oldBalances["geodb"];

      assert.ok(
        Web3Utils.isHexStrict(result.transactionHash),
        "Transaction did not go through"
      );

      assert.equal(
        contractBalanceDelta,
        -stakeRequirement,
        `Balance delta did not match. Actual: ${contractBalanceDelta}, Expected: ${-stakeRequirement}`
      );

      assert.equal(
        geodbBalanceDelta,
        stakeRequirement,
        `Balance delta did not match. Actual: ${contractBalanceDelta}, Expected: ${stakeRequirement}`
      );
    });

    it("rejects low stakings", async () => {
      try {
        const tx = await contractProxy["geodb"].federationStakeLock(
          stakeRequirement - 1
        );
        const result = await tx.wait();
        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.stakedAmountIsNotEnough,
            `Unexpected error message. Got "${errorMsg}", expected "${
              errorMsgs.stakedAmountIsNotEnough
            }"`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("rejects withdrawals for non-existant stakes", async () => {
      try {
        const tx = await contractProxy["geodb"].federationStakeWithdraw();
        const result = await tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.noStake,
            `Unexpected error message. Got "${errorMsg}", expected "${
              errorMsgs.noStake
            }"`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("rejects rewards release for non-federated parties", async () => {
      try {
        const tx = await contractProxy["geodb"].releaseRewards(
          accounts["org1"].address,
          stakeRequirement
        );
        const result = await tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.callerMustBeFederated,
            `Unexpected error message. Got "${errorMsg}", expected "${
              errorMsgs.callerMustBeFederated
            }"`
          );
        } else {
          assert.fail(e);
        }
      }
    });
  }); // Describe Basic staking test

  describe("Multiparty staking test", () => {
    before("Contract deployment", async () => {
      let factory = new ethers.ContractFactory(
        compiledGeoDBRoot.abi,
        compiledGeoDBRoot.bytecode,
        accounts["geodb"]
      );

      rootSmartContract = await factory.deploy();
      await rootSmartContract.deployed();

      assert.ok(
        rootSmartContract.address && rootSmartContract.deployTransaction.hash,
        "Contract could not be deployed"
      );
      stakeRequirement = (await rootSmartContract.getCurrentFederationStakeRequirement()).toNumber();

      contractProxy["geodb"] = rootSmartContract.connect(accounts["geodb"]);
      contractProxy["org1"] = rootSmartContract.connect(accounts["org1"]);
      contractProxy["org2"] = rootSmartContract.connect(accounts["org2"]);
      contractProxy["org3"] = rootSmartContract.connect(accounts["org3"]);

      await (await contractProxy["geodb"].transfer(
        accounts["org1"].address,
        stakeRequirement
      )).wait();
      await (await contractProxy["geodb"].transfer(
        accounts["org2"].address,
        stakeRequirement
      )).wait();
      await (await contractProxy["geodb"].transfer(
        accounts["org3"].address,
        stakeRequirement
      )).wait();
    });

    beforeEach("Update organizations balance", async () => {
      oldBalances[
        "contract"
      ] = (await rootSmartContract.totalStake()).toNumber();
      oldBalances["geodb"] = (await rootSmartContract.balanceOf(
        accounts["geodb"].address
      )).toNumber();
      oldBalances["org1"] = (await rootSmartContract.balanceOf(
        accounts["org1"].address
      )).toNumber();
      oldBalances["org2"] = (await rootSmartContract.balanceOf(
        accounts["org2"].address
      )).toNumber();
      oldBalances["org3"] = (await rootSmartContract.balanceOf(
        accounts["org3"].address
      )).toNumber();
    });

    it("allows multiple parties to stake and join the federation", async () => {
      // Org1 Assertions

      await (await contractProxy["org1"].federationStakeLock(
        stakeRequirement
      )).wait();
      const org1Balance = await contractProxy["org1"].balanceOf(
        accounts["org1"].address
      );

      const org1BalanceDelta = org1Balance.toNumber() - oldBalances["org1"];

      assert.equal(
        org1BalanceDelta,
        -stakeRequirement,
        `Balance delta did not match. Actual: ${org1Balance}, Expected: ${-stakeRequirement}`
      );

      // Org2 Assertions

      await (await contractProxy["org2"].federationStakeLock(
        stakeRequirement
      )).wait();
      const org2Balance = await contractProxy["org2"].balanceOf(
        accounts["org2"].address
      );

      const org2BalanceDelta = org2Balance.toNumber() - oldBalances["org2"];

      assert.equal(
        org2BalanceDelta,
        -stakeRequirement,
        `Balance delta did not match. Actual: ${org2Balance}, Expected: ${-stakeRequirement}`
      );

      // Org3 Assertions

      await (await contractProxy["org3"].federationStakeLock(
        stakeRequirement
      )).wait();

      const org3Balance = await contractProxy["org3"].balanceOf(
        accounts["org3"].address
      );

      const org3BalanceDelta = org3Balance.toNumber() - oldBalances["org3"];

      assert.equal(
        org3BalanceDelta,
        -stakeRequirement,
        `Balance delta did not match. Actual: ${org3Balance}, Expected: ${-stakeRequirement}`
      );

      // Contract assertions

      const contractBalance = await contractProxy["geodb"].totalStake();

      const contractBalanceDelta =
        contractBalance.toNumber() - oldBalances["contract"];

      assert.equal(
        contractBalanceDelta,
        3 * stakeRequirement,
        `Balance delta did not match. Actual: ${contractBalanceDelta}, Expected: ${3 *
          stakeRequirement}`
      );
    });

    it("rejects unrequested withdrawal", async () => {
      try {
        const tx = await contractProxy["org3"].federationStakeWithdraw();
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.requestWithDrawalFirst,
            `Unexpected error message. Got "${errorMsg}", expected "${
              errorMsgs.requestWithDrawalFirst
            }"`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("rejects withdrawal with 1/4 of the votes", async () => {
      try {
        await (await contractProxy["org3"].requestStakeWithdrawal()).wait();

        const tx = await contractProxy["org3"].federationStakeWithdraw();
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.notEnoughVotes,
            `Unexpected error message. Got "${errorMsg}", expected "${
              errorMsgs.notEnoughVotes
            }"`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("allows to vote withdrawal request", async () => {
      const tx = await contractProxy["org2"].voteStakeWithdrawalRequest(
        accounts["org3"].address,
        1
      );

      const result = await tx.wait();

      assert.ok(
        Web3Utils.isHexStrict(result.transactionHash),
        `Transaction did not go through: ${result}`
      );
    });

    it("rejects voting twice", async () => {
      try {
        const tx = await contractProxy["org2"].voteStakeWithdrawalRequest(
          accounts["org3"].address,
          1
        );
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.cannotVoteTwice,
            `Unexpected error message. Got "${errorMsg}", expected "${
              errorMsgs.cannotVoteTwice
            }"`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("rejects self voting", async () => {
      try {
        const tx = await contractProxy["org3"].voteStakeWithdrawalRequest(
          accounts["org3"].address,
          1
        );
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.noSelfVoting,
            `Unexpected error message. Got "${errorMsg}", expected "${
              errorMsgs.noSelfVoting
            }"`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("accepts withdrawal with 1/2 of the votes", async () => {
      let stk;

      stk = (await rootSmartContract.balanceOf(
        rootSmartContract.address
      )).toNumber();

      const test = await (await contractProxy["geodb"].transfer(
        rootSmartContract.address,
        1000000
      )).wait();

      stk = (await rootSmartContract.balanceOf(
        rootSmartContract.address
      )).toNumber();

      const currentStake = (await contractProxy["org3"].getStake()).toNumber();
      const tx = await contractProxy["org3"].federationStakeWithdraw();
      const result = await tx.wait();

      const contractBalance = await contractProxy["org3"].totalStake();

      const org3Balance = await contractProxy["org3"].balanceOf(
        accounts["org3"].address
      );

      const contractBalanceDelta =
        contractBalance.toNumber() - oldBalances["contract"];

      const org3BalanceDelta = org3Balance.toNumber() - oldBalances["org3"];

      assert.ok(
        Web3Utils.isHexStrict(result.transactionHash),
        "Transaction did not go through"
      );

      assert.equal(
        contractBalanceDelta,
        -currentStake,
        `Balance delta did not match. Actual: ${contractBalanceDelta}, Expected: ${-currentStake}`
      );

      assert.equal(
        org3BalanceDelta,
        currentStake,
        `Balance delta did not match. Actual: ${contractBalanceDelta}, Expected: ${currentStake}`
      );
    });
  }); // Describe Multiparty staking test

  describe("Basic federation staking change", () => {
    before("Contract deployment", async () => {
      let factory = new ethers.ContractFactory(
        compiledGeoDBRoot.abi,
        compiledGeoDBRoot.bytecode,
        accounts["geodb"]
      );

      rootSmartContract = await factory.deploy();
      await rootSmartContract.deployed();

      assert.ok(
        rootSmartContract.address && rootSmartContract.deployTransaction.hash,
        "Contract could not be deployed"
      );
      stakeRequirement = (await rootSmartContract.getCurrentFederationStakeRequirement()).toNumber();

      contractProxy["geodb"] = rootSmartContract.connect(accounts["geodb"]);
      contractProxy["org1"] = rootSmartContract.connect(accounts["org1"]);
      contractProxy["org2"] = rootSmartContract.connect(accounts["org2"]);
      contractProxy["org3"] = rootSmartContract.connect(accounts["org3"]);

      await (await contractProxy["geodb"].federationStakeLock(
        stakeRequirement * 5
      )).wait();

      await (await contractProxy["geodb"].transfer(
        accounts["org1"].address,
        stakeRequirement * 2
      )).wait();
      await (await contractProxy["geodb"].transfer(
        accounts["org2"].address,
        stakeRequirement * 3
      )).wait();
      await (await contractProxy["geodb"].transfer(
        accounts["org3"].address,
        stakeRequirement * 4
      )).wait();

      await (await contractProxy["geodb"].federationStakeLock(
        stakeRequirement * 3
      )).wait();

      await (await contractProxy["org1"].federationStakeLock(
        stakeRequirement * 2
      )).wait();

      await (await contractProxy["org2"].federationStakeLock(
        stakeRequirement * 3
      )).wait();
    });

    beforeEach("Update organizations balance", async () => {
      oldBalances[
        "contract"
      ] = (await rootSmartContract.totalStake()).toNumber();
      oldBalances["geodb"] = (await rootSmartContract.balanceOf(
        accounts["geodb"].address
      )).toNumber();
      oldBalances["org1"] = (await rootSmartContract.balanceOf(
        accounts["org1"].address
      )).toNumber();
      oldBalances["org2"] = (await rootSmartContract.balanceOf(
        accounts["org2"].address
      )).toNumber();
      oldBalances["org3"] = (await rootSmartContract.balanceOf(
        accounts["org3"].address
      )).toNumber();
    });

    it("allows federated member to create a new ballot", async () => {
      const result = await (await contractProxy["org2"].newStakingBallot(
        stakeRequirement * 3
      )).wait();

      assert.ok(
        Web3Utils.isHexStrict(result.transactionHash),
        "Transaction did not go through"
      );
    });

    it("rejects non-federated member to create a new ballot", async () => {
      try {
        const tx = await contractProxy["org3"].newStakingBallot(
          stakeRequirement * 2
        );
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.callerMustBeFederated,
            `Unexpected error message`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("rejects non-federated member to vote a new ballot", async () => {
      try {
        const tx = await contractProxy["org3"].voteStakingBallot(0);
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.callerMustBeFederated,
            `Unexpected error message`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("rejects new staking resolution if there are not enough votes", async () => {
      try {
        const tx = await contractProxy["org2"].resolveStakingBallot(0);
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.notEnoughVotes,
            `Unexpected error message`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("allows federated member to vote on a staking ballot", async () => {
      const result = await (await contractProxy["geodb"].voteStakingBallot(
        0
      )).wait();

      assert.ok(
        Web3Utils.isHexStrict(result.transactionHash),
        "Transaction did not go through"
      );

      let stakingBallot = await rootSmartContract.federationStakingBallots(0);
      let geodbStake = (await contractProxy["geodb"].getStake()).toNumber();
      let org1Stake = (await contractProxy["org2"].getStake()).toNumber();

      assert.equal(
        stakingBallot.approvals.toNumber(),
        geodbStake + org1Stake,
        "Staking on ballots mismatch"
      );
    });

    it("rejects voting twice", async () => {
      try {
        const tx = await contractProxy["geodb"].voteStakingBallot(0);
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.cannotVoteTwice,
            `Unexpected error message`
          );
        } else {
          assert.fail(e);
        }
      }

      try {
        const tx = await contractProxy["org2"].voteStakingBallot(0);
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.cannotVoteTwice,
            `Unexpected error message`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("allows to resolve the vote and set new stake minimum", async () => {
      const result = await (await contractProxy["org2"].resolveStakingBallot(
        0
      )).wait();

      assert.ok(
        Web3Utils.isHexStrict(result.transactionHash),
        "Transaction did not go through"
      );

      const newStakeRequirement = (await rootSmartContract.federationMinimumStake()).toNumber();

      assert.equal(
        stakeRequirement * 3,
        newStakeRequirement,
        "Stake was not updated"
      );

      stakeRequirement = newStakeRequirement;
    });

    it("rejects member without enough stake after minimum stake update", async () => {
      try {
        const tx = await contractProxy["org1"].newStakingBallot(
          stakeRequirement / 3
        );
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.callerMustBeFederated,
            `Unexpected error message`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("rejects pre-voting ballots", async () => {
      try {
        const tx = await contractProxy["geodb"].voteStakingBallot(1);
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.invalidBallotIndex,
            `Unexpected error message`
          );
        } else {
          assert.fail(e);
        }
      }
    });

    it("rejects voting approved ballots", async () => {
      try {
        const tx = await contractProxy["geodb"].voteStakingBallot(0);
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.invalidBallotIsApproved,
            `Unexpected error message`
          );
        } else {
          assert.fail(e);
        }
      }
    });
  }); // Basic federation staking change

  describe("Federation staking change rejected when deadline has passed", async () => {
    before("Contract deployment", async () => {
      let factory = new ethers.ContractFactory(
        compiledGeoDBRoot.abi,
        compiledGeoDBRoot.bytecode,
        accounts["geodb"]
      );

      rootSmartContract = await factory.deploy();
      await rootSmartContract.deployed();

      assert.ok(
        rootSmartContract.address && rootSmartContract.deployTransaction.hash,
        "Contract could not be deployed"
      );
      stakeRequirement = (await rootSmartContract.getCurrentFederationStakeRequirement()).toNumber();

      contractProxy["geodb"] = rootSmartContract.connect(accounts["geodb"]);
      contractProxy["org1"] = rootSmartContract.connect(accounts["org1"]);
      contractProxy["org2"] = rootSmartContract.connect(accounts["org2"]);
      contractProxy["org3"] = rootSmartContract.connect(accounts["org3"]);

      await (await contractProxy["geodb"].federationStakeLock(
        stakeRequirement * 5
      )).wait();

      await (await contractProxy["geodb"].transfer(
        accounts["org1"].address,
        stakeRequirement * 2
      )).wait();
      await (await contractProxy["geodb"].transfer(
        accounts["org2"].address,
        stakeRequirement * 3
      )).wait();
      await (await contractProxy["geodb"].transfer(
        accounts["org3"].address,
        stakeRequirement * 4
      )).wait();

      await (await contractProxy["geodb"].federationStakeLock(
        stakeRequirement * 3
      )).wait();

      await (await contractProxy["org1"].federationStakeLock(
        stakeRequirement * 2
      )).wait();

      await (await contractProxy["org2"].federationStakeLock(
        stakeRequirement * 3
      )).wait();

      // Create staking ballot
      await (await contractProxy["geodb"].newStakingBallot(
        stakeRequirement * 2
      )).wait();
    });

    beforeEach("Update organizations balance", async () => {
      oldBalances[
        "contract"
      ] = (await rootSmartContract.totalStake()).toNumber();
      oldBalances["geodb"] = (await rootSmartContract.balanceOf(
        accounts["geodb"].address
      )).toNumber();
      oldBalances["org1"] = (await rootSmartContract.balanceOf(
        accounts["org1"].address
      )).toNumber();
      oldBalances["org2"] = (await rootSmartContract.balanceOf(
        accounts["org2"].address
      )).toNumber();
      oldBalances["org3"] = (await rootSmartContract.balanceOf(
        accounts["org3"].address
      )).toNumber();
    });

    it("rejects staking vote after the deadline has passed", async () => {
      const delta = 2 * 24 * 3600;
      const increaseTime = await ethersProvider.send("evm_increaseTime", [
        delta
      ]);

      try {
        const tx = await contractProxy["org1"].voteStakingBallot(0);
        const result = tx.wait();

        assert.fail("Transaction confirmed an illegal state");
      } catch (e) {
        if (e.transactionHash) {
          const transactionHash = e.transactionHash;
          const errorMsg = e.results[`${transactionHash}`].reason;
          assert.equal(
            errorMsg,
            errorMsgs.deadline,
            `Unexpected error message`
          );
        } else {
          assert.fail(e);
        }
      }
    });
  });
}); // Describe GeoDBRoot
