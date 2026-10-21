//! Contract tests for #310, implemented alongside delegation (#1/#47/#60).
//! The plan below remains available for maintainer review before merge.
//! All scenarios invoke the real token and its generated contract client.
//!
//! Review assumptions with the delegation PR:
//! - Delegating moves only voting power, never tokens. Incoming power adds to
//!   the recipient's own explicitly self-delegated power. The fixture does not
//!   assume whether a holder has votes before their first self-delegation.
//! - Re-delegation removes power from the previous recipient exactly once.
//! - Self-delegation clears an existing delegation (#310/#60); without a
//!   previous delegation it is a no-op, with no double-counting (#47).
//! - get_past_votes reads the closing power at or before the requested ledger,
//!   matching get_past_balance. Later changes must not rewrite older snapshots.
//!
//! Review matrix (Alice/Bob/Carol start with balances 100/40/20 at ledger 10):
//! - Delegate Alice -> Bob at 20: votes at 19 = 100/40/20; at 20/21 = 0/140/20.
//! - Re-delegate Alice -> Carol at 30: votes at 29 = 0/140/20;
//!   at 30/31 = 0/40/120. Re-reading ledger 19/20 must keep the original values.
//! - Clear Alice -> Alice at 30: votes at 29 = 0/140/20;
//!   at 30/31 = 100/40/20. Bob must lose only Alice's delegated weight.
//! - Every case checks unchanged balances/supply and conserved voting power.
//!
//! The token owns the vote checkpoints; governance delegates through that
//! token and reads its historical weights. Self-delegation clears delegation.
//!
//! The cases below cover before/on/after boundaries, clearing, repeated calls,
//! changes in one ledger, and delegator authorization. Governance vote()
//! integration is covered in the governance delegation unit tests.
//! Run from contracts/: `cargo test -p quorum-token --lib delegation`.

use super::{deploy, INITIAL_SUPPLY};
use crate::{QuorumTokenClient, TokenError};
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{Address, Env};

struct Fixture<'a> {
    token: QuorumTokenClient<'a>,
    delegation: QuorumTokenClient<'a>,
    admin: Address,
    alice: Address,
    bob: Address,
    carol: Address,
}

fn setup(env: &Env) -> Fixture<'_> {
    env.ledger().set_sequence_number(10);
    let (admin, token) = deploy(env);
    let alice = Address::generate(env);
    let bob = Address::generate(env);
    let carol = Address::generate(env);
    token.transfer(&admin, &alice, &100);
    token.transfer(&admin, &bob, &40);
    token.transfer(&admin, &carol, &20);
    let delegation = QuorumTokenClient::new(env, &token.address);
    for owner in [&admin, &alice, &bob, &carol] {
        delegation.delegate(owner, owner);
    }
    Fixture {
        token,
        delegation,
        admin,
        alice,
        bob,
        carol,
    }
}

impl Fixture<'_> {
    fn assert_votes(&self, ledger: u32, expected: [i128; 3]) {
        let actual = [
            self.delegation.get_past_votes(&self.alice, &ledger),
            self.delegation.get_past_votes(&self.bob, &ledger),
            self.delegation.get_past_votes(&self.carol, &ledger),
        ];
        assert_eq!(actual, expected, "voting power at ledger {ledger}");
        let admin_votes = self.delegation.get_past_votes(&self.admin, &ledger);
        let supply = self.token.get_past_total_supply(&ledger);
        assert_eq!(admin_votes + actual.iter().sum::<i128>(), supply);
    }

    fn assert_balances_unchanged(&self) {
        assert_eq!(self.token.balance(&self.admin), INITIAL_SUPPLY - 160);
        assert_eq!(self.token.balance(&self.alice), 100);
        assert_eq!(self.token.balance(&self.bob), 40);
        assert_eq!(self.token.balance(&self.carol), 20);
        assert_eq!(self.token.total_supply(), INITIAL_SUPPLY);
        for ledger in [19, 20, 29, 30, 31] {
            assert_eq!(self.token.get_past_balance(&self.alice, &ledger), 100);
            assert_eq!(self.token.get_past_balance(&self.bob, &ledger), 40);
            assert_eq!(self.token.get_past_balance(&self.carol, &ledger), 20);
        }
    }
}

#[test]
fn delegate_moves_voting_power_without_transferring_tokens() {
    let env = Env::default();
    let f = setup(&env);

    env.ledger().set_sequence_number(20);
    f.delegation.delegate(&f.alice, &f.bob);
    env.ledger().set_sequence_number(31);

    f.assert_votes(9, [0, 0, 0]);
    f.assert_votes(10, [100, 40, 20]);
    f.assert_votes(19, [100, 40, 20]);
    f.assert_votes(20, [0, 140, 20]);
    f.assert_votes(21, [0, 140, 20]);
    f.assert_votes(30, [0, 140, 20]);
    f.assert_balances_unchanged();
}

#[test]
fn redelegate_removes_power_from_the_previous_delegate() {
    let env = Env::default();
    let f = setup(&env);

    env.ledger().set_sequence_number(20);
    f.delegation.delegate(&f.alice, &f.bob);
    env.ledger().set_sequence_number(30);
    f.delegation.delegate(&f.alice, &f.carol);
    env.ledger().set_sequence_number(32);

    f.assert_votes(19, [100, 40, 20]);
    f.assert_votes(20, [0, 140, 20]);
    f.assert_votes(29, [0, 140, 20]);
    f.assert_votes(30, [0, 40, 120]);
    f.assert_votes(31, [0, 40, 120]);
    f.assert_balances_unchanged();
}

#[test]
fn self_delegate_clears_delegation_and_restores_own_voting_power() {
    let env = Env::default();
    let f = setup(&env);

    env.ledger().set_sequence_number(20);
    f.delegation.delegate(&f.alice, &f.bob);
    env.ledger().set_sequence_number(30);
    f.delegation.delegate(&f.alice, &f.alice);
    env.ledger().set_sequence_number(32);

    f.assert_votes(19, [100, 40, 20]);
    f.assert_votes(20, [0, 140, 20]);
    f.assert_votes(29, [0, 140, 20]);
    f.assert_votes(30, [100, 40, 20]);
    f.assert_votes(31, [100, 40, 20]);
    f.assert_balances_unchanged();
}

#[test]
fn self_delegate_without_external_delegation_does_not_double_count() {
    let env = Env::default();
    let f = setup(&env);

    env.ledger().set_sequence_number(20);
    f.delegation.delegate(&f.alice, &f.alice);
    env.ledger().set_sequence_number(32);

    for ledger in [19, 20, 21, 30] {
        f.assert_votes(ledger, [100, 40, 20]);
    }
    f.assert_balances_unchanged();
}

#[test]
fn repeated_delegation_to_the_same_delegate_does_not_double_count() {
    let env = Env::default();
    let f = setup(&env);

    env.ledger().set_sequence_number(20);
    f.delegation.delegate(&f.alice, &f.bob);
    env.ledger().set_sequence_number(30);
    f.delegation.delegate(&f.alice, &f.bob);
    env.ledger().set_sequence_number(32);

    f.assert_votes(19, [100, 40, 20]);
    for ledger in [20, 29, 30, 31] {
        f.assert_votes(ledger, [0, 140, 20]);
    }
    f.assert_balances_unchanged();
}

#[test]
fn changes_in_one_ledger_preserve_its_closing_voting_power() {
    let env = Env::default();
    let f = setup(&env);

    env.ledger().set_sequence_number(20);
    f.delegation.delegate(&f.alice, &f.bob);
    f.delegation.delegate(&f.alice, &f.carol);
    f.delegation.delegate(&f.alice, &f.alice);
    env.ledger().set_sequence_number(32);

    for ledger in [19, 20, 21, 30] {
        f.assert_votes(ledger, [100, 40, 20]);
    }
    f.assert_balances_unchanged();
}

#[test]
fn delegate_requires_delegator_authorization_and_preserves_state_on_failure() {
    let env = Env::default();
    let f = setup(&env);

    env.ledger().set_sequence_number(20);
    env.set_auths(&[]);
    assert!(f.delegation.try_delegate(&f.alice, &f.bob).is_err());
    env.ledger().set_sequence_number(21);
    f.assert_votes(19, [100, 40, 20]);
    f.assert_votes(20, [100, 40, 20]);

    env.mock_all_auths();
    f.delegation.delegate(&f.alice, &f.bob);
    assert_eq!(env.auths().len(), 1);
    assert_eq!(env.auths()[0].0, f.alice);
    env.ledger().set_sequence_number(32);
    f.assert_votes(20, [100, 40, 20]);
    f.assert_votes(21, [0, 140, 20]);
    f.assert_votes(30, [0, 140, 20]);
    f.assert_balances_unchanged();
}

#[test]
fn all_balance_changing_paths_update_the_current_representative() {
    let env = Env::default();
    let f = setup(&env);
    let spender = Address::generate(&env);
    env.ledger().set_sequence_number(20);
    f.token.delegate(&f.alice, &f.bob);
    env.ledger().set_sequence_number(21);
    f.token.mint(&f.alice, &50);
    env.ledger().set_sequence_number(22);
    f.token.transfer(&f.alice, &f.carol, &30);
    env.ledger().set_sequence_number(23);
    f.token.approve(&f.alice, &spender, &25, &100);
    f.token.transfer_from(&spender, &f.alice, &f.bob, &20);
    env.ledger().set_sequence_number(24);
    f.token.burn_from(&spender, &f.alice, &5);
    env.ledger().set_sequence_number(25);
    f.token.burn(&f.alice, &10);
    env.ledger().set_sequence_number(26);
    for (ledger, votes) in [
        (19, [100, 40, 20]),
        (20, [0, 140, 20]),
        (21, [0, 190, 20]),
        (22, [0, 160, 50]),
        (23, [0, 160, 50]),
        (24, [0, 155, 50]),
        (25, [0, 145, 50]),
    ] {
        f.assert_votes(ledger, votes);
    }
    assert_eq!(f.token.balance(&f.alice), 85);
    assert_eq!(f.token.balance(&f.bob), 60);
    assert_eq!(f.token.balance(&f.carol), 50);
    assert_eq!(f.token.total_supply(), INITIAL_SUPPLY + 35);
}

#[test]
fn incoming_delegations_are_not_forwarded_and_cycles_do_not_duplicate_weight() {
    let env = Env::default();
    let f = setup(&env);
    env.ledger().set_sequence_number(20);
    f.token.delegate(&f.alice, &f.bob);
    env.ledger().set_sequence_number(30);
    f.token.delegate(&f.bob, &f.carol);
    env.ledger().set_sequence_number(40);
    f.token.delegate(&f.carol, &f.alice);
    env.ledger().set_sequence_number(50);
    f.token.delegate(&f.alice, &f.alice);
    env.ledger().set_sequence_number(51);
    f.assert_votes(20, [0, 140, 20]);
    f.assert_votes(30, [0, 100, 60]);
    f.assert_votes(40, [20, 100, 40]);
    f.assert_votes(50, [120, 0, 40]);
    f.assert_balances_unchanged();
}

#[test]
fn multiple_holders_add_weight_and_clearing_removes_only_the_callers_weight() {
    let env = Env::default();
    let f = setup(&env);
    env.ledger().set_sequence_number(20);
    f.token.delegate(&f.alice, &f.bob);
    f.token.delegate(&f.carol, &f.bob);
    env.ledger().set_sequence_number(30);
    f.token.delegate(&f.alice, &f.alice);
    env.ledger().set_sequence_number(31);
    f.assert_votes(19, [100, 40, 20]);
    f.assert_votes(20, [0, 160, 0]);
    f.assert_votes(30, [100, 60, 0]);
    f.assert_balances_unchanged();
}

#[test]
fn zero_account_clears_and_a_zero_balance_holder_can_delegate_future_mints() {
    let env = Env::default();
    let f = setup(&env);
    let empty = Address::generate(&env);
    assert_eq!(f.token.get_delegates(&empty), empty);
    assert_eq!(f.token.get_past_votes(&empty, &9), 0);
    env.ledger().set_sequence_number(20);
    f.token.delegate(&empty, &f.bob);
    f.token.mint(&empty, &7);
    assert_eq!(f.token.get_delegates(&empty), f.bob);
    assert_eq!(f.token.get_past_votes(&f.bob, &20), 47);
    env.ledger().set_sequence_number(30);
    let zero = Address::from_str(
        &env,
        "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    );
    f.token.delegate(&empty, &zero);
    env.ledger().set_sequence_number(31);
    assert_eq!(f.token.get_delegates(&empty), empty);
    assert_eq!(f.token.get_past_votes(&empty, &30), 7);
    assert_eq!(f.token.get_past_votes(&f.bob, &30), 40);
    assert_eq!(f.token.get_past_votes(&f.bob, &20), 47);
}

#[test]
fn balance_history_is_preserved_when_existing_holders_first_use_delegation() {
    let env = Env::default();
    let f = setup(&env);
    // Simulate an existing deployment that only has balance checkpoints.
    env.as_contract(&f.token.address, || {
        for owner in [&f.admin, &f.alice, &f.bob, &f.carol] {
            env.storage()
                .persistent()
                .remove(&crate::DataKey::VoteCheckpoints(owner.clone()));
        }
    });
    env.ledger().set_sequence_number(20);
    f.token.delegate(&f.alice, &f.bob);
    env.ledger().set_sequence_number(21);
    f.assert_votes(9, [0, 0, 0]);
    f.assert_votes(10, [100, 40, 20]);
    f.assert_votes(19, [100, 40, 20]);
    f.assert_votes(20, [0, 140, 20]);
}

#[test]
fn delegation_events_describe_changes_and_overflow_rolls_back() {
    use soroban_sdk::testutils::Events as _;
    use soroban_sdk::{IntoVal, Symbol, TryFromVal, Vec};
    let env = Env::default();
    let f = setup(&env);
    env.ledger().set_sequence_number(20);
    f.token.delegate(&f.alice, &f.bob);
    let (_, topics, data) = env.events().all().last().unwrap();
    assert_eq!(
        topics,
        (
            Symbol::new(&env, "delegated"),
            f.alice.clone(),
            f.bob.clone()
        )
            .into_val(&env)
    );
    assert_eq!(
        crate::Delegated::try_from_val(&env, &data).unwrap(),
        crate::Delegated {
            delegator: f.alice.clone(),
            delegatee: f.bob.clone(),
        }
    );
    f.token.delegate(&f.alice, &f.bob);
    assert!(env.events().all().is_empty());
    env.as_contract(&f.token.address, || {
        let mut history = Vec::new(&env);
        history.push_back(crate::Checkpoint {
            ledger: 20,
            balance: i128::MAX,
        });
        env.storage()
            .persistent()
            .set(&crate::DataKey::VoteCheckpoints(f.carol.clone()), &history);
    });
    env.ledger().set_sequence_number(30);
    assert_eq!(
        f.token.try_delegate(&f.alice, &f.carol),
        Err(Ok(TokenError::Overflow))
    );
    assert_eq!(f.token.get_delegates(&f.alice), f.bob);
    assert_eq!(f.token.get_past_votes(&f.bob, &30), 140);
    f.assert_balances_unchanged();
}

#[test]
fn delegation_and_vote_checkpoints_survive_idle_periods_and_pruning() {
    use soroban_sdk::testutils::storage::Persistent as _;
    let env = Env::default();
    let f = setup(&env);
    env.ledger().set_sequence_number(20);
    f.token.delegate(&f.alice, &f.bob);
    let aged = 20 + super::super::TTL_EXTEND_TO - 1_000;
    env.ledger().set_sequence_number(aged);
    assert_eq!(f.token.get_delegates(&f.alice), f.bob);
    assert_eq!(f.token.get_past_votes(&f.bob, &20), 140);
    env.as_contract(&f.token.address, || {
        for key in [
            crate::DataKey::Delegate(f.alice.clone()),
            crate::DataKey::VoteCheckpoints(f.bob.clone()),
        ] {
            assert!(env.storage().persistent().get_ttl(&key) >= super::super::TTL_THRESHOLD);
        }
    });
    f.token.mint(&f.alice, &10);
    env.ledger().set_sequence_number(aged + 1);
    assert_eq!(f.token.get_past_votes(&f.bob, &(aged - 1)), 140);
    assert_eq!(f.token.get_past_votes(&f.bob, &aged), 150);
    assert_eq!(f.token.get_past_votes(&f.alice, &aged), 0);
    env.as_contract(&f.token.address, || {
        let history: soroban_sdk::Vec<crate::Checkpoint> = env
            .storage()
            .persistent()
            .get(&crate::DataKey::VoteCheckpoints(f.bob.clone()))
            .unwrap();
        assert_eq!(history.len(), 2);
    });
}
