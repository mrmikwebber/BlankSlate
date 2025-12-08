// cypress/e2e/multi_month_behaviour.cy.ts

import { BUDGET_URL } from "../support/testConstants";

// Normalized selectors (data-category instead of data-group, updated creation selectors, month-nav data-cy attributes)
interface SeededAccount {
  id: string;
  name: string;
  type: "debit" | "credit";
}

interface SeededAccounts {
  checking: SeededAccount;
  savings: SeededAccount;
  visa: SeededAccount;
  amex: SeededAccount;
}

let accounts: SeededAccounts;

const parseCurrency = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

const visitBudget = () => {
  cy.wait(1000);
  cy.visit(BUDGET_URL);
  cy.get("[data-cy=budget-table]").should("exist");
};

const visitAccount = (id: string, expectedName: string) => {
  cy.visit(`/accounts/${id}`);
  cy.get("[data-cy=account-name]").should("contain.text", expectedName);
};

const goToNextMonth = () => cy.get("[data-cy=month-next]").click();
const goToPrevMonth = () => cy.get("[data-cy=month-prev]").click();
const getCurrentMonthLabel = () => cy.get("[data-cy=month-label]").invoke("text");

// Helper: create a category group + item in current month via Budget UI
const createCategoryInCurrentMonth = (groupName: string, itemName: string) => {
  cy.get("[data-cy=add-category-group-button]").click();
  cy.get("[data-cy=add-category-group-input]").type(groupName);
  cy.get("[data-cy=add-category-group-submit]").click();

  // Reveal the add-item button with hover; prefer first visible, fallback to forced click
  cy.get(`tr[data-cy="category-group-row"][data-category="${groupName}"]`).first().trigger("mouseover");
  cy.get(`[data-category="${groupName}"] [data-cy="group-add-item-button"]`)
    .filter(":visible")
    .first()
    .then(($btn) => {
      if ($btn.length) {
        cy.wrap($btn).click();
      } else {
        cy.get(`[data-category="${groupName}"] [data-cy="group-add-item-button"]`).first().click({ force: true });
      }
    });
  cy.get("[data-cy=add-item-input]").type(itemName);
  cy.get("[data-cy=add-item-submit]").click();

  cy.get(
    `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
  ).should("exist");
};

describe("Multi-month behaviour – carryover, overspending, edits", () => {
  beforeEach(() => {
    cy.login("thedasherx@gmail.com", "123456");
    cy.getSeededAccounts().then((acc: any) => {
      accounts = acc as SeededAccounts;
    });
    visitBudget();
  });

  // 1) Carry positive available forward
  it("carries positive available forward to the next month", () => {
    const groupName = "Carryover Group";
    const itemName = "Carryover Cat";
    const amount = 100;

    getCurrentMonthLabel().as("monthN");
    createCategoryInCurrentMonth(groupName, itemName);

    // Assign money in month N
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get('[data-cy="assigned-display"]').click();
      cy.get('[data-cy="assigned-input"]').clear().type(`${amount}{enter}`);
    });

    // Assert month N state
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(amount));
    });

    // Move to month N+1
    cy.get("@monthN").then((oldLabel: any) => {
      goToNextMonth();
      // Wait for month label to actually change
      cy.get("[data-cy=month-label]").should('not.contain.text', oldLabel);
    });

    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    )
      .should("exist")
      .within(() => {
        cy.get("[data-cy=item-available]")
          .invoke("text")
          .then((txt) => expect(parseCurrency(txt)).to.eq(amount));
      });
  });

  // 2) Overspending does not roll negative available forward
  it("does not carry negative available straight into the next month for cash overspending", () => {
    const groupName = "Overspend Carry Group";
    const itemName = "Overspend Carry Cat";
    const amount = 40;

    getCurrentMonthLabel().as("monthN");
    createCategoryInCurrentMonth(groupName, itemName);

    // Make overspending transaction in month N
    visitAccount(accounts.checking.id, accounts.checking.name);
    cy.get("[data-cy=add-transaction-button]").click();
    cy.get("[data-cy=tx-payee-select]").select("__new__");
    cy.get("[data-cy=tx-new-payee-input]").type("Overspend Store");
    cy.get("[data-cy=tx-item-select]").select(`${groupName}::${itemName}`);
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      if ($btn.text().trim() !== "−") cy.wrap($btn).click();
    });
    cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
    cy.get("[data-cy=tx-submit]").click();

    // Month N category shows negative available
    visitBudget();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(-amount));
    });

    // Move to N+1
    cy.get("@monthN").then((oldLabel: any) => {
      goToNextMonth();
      // Wait for month label to actually change
      cy.get("[data-cy=month-label]").should('not.contain.text', oldLabel);
    });

    // Negative should not persist as starting available
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.be.at.least(0));
    });
  });

  // 3) Editing past month transaction only affects that month
  // 3) Editing past month transaction only affects that month
  it("keeps transactions and category math scoped to their original month", () => {
    const groupName = "Scoped Edit Group";
    const itemName = "Scoped Edit Cat";
    const initialAmount = 20;
    const editedAmount = 60;

    getCurrentMonthLabel().as("monthN");
    createCategoryInCurrentMonth(groupName, itemName);

    // Purchase in month N (simple debit expense, overspending this category)
    visitAccount(accounts.checking.id, accounts.checking.name);
    cy.get("[data-cy=add-transaction-button]").click();
    cy.get("[data-cy=tx-payee-select]").select("__new__");
    cy.get("[data-cy=tx-new-payee-input]").type("Scoped Store");
    cy.get("[data-cy=tx-item-select]").select(`${groupName}::${itemName}`);
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      if ($btn.text().trim() !== "−") cy.wrap($btn).click();
    });
    cy.get("[data-cy=tx-amount-input]").clear().type(String(initialAmount));
    cy.get("[data-cy=tx-submit]").click();

    // --- Month N: activity and available reflect the original amount ---
    visitBudget();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(-initialAmount));

      // With no assignments or prior history, available should match activity
      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(-initialAmount));
    });

    // --- Month N+1: no activity/available yet for this category ---
    goToNextMonth();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(0));

      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(0));
    });

    // --- Back to month N and edit the same transaction ---
    goToPrevMonth();
    visitAccount(accounts.checking.id, accounts.checking.name);
    cy.get("[data-cy=transaction-row]").first().as("txRow");
    cy.get("@txRow").rightclick();
    cy.get("[data-cy=context-edit-transaction]").click();
    cy.get("[data-cy=transaction-form-row-edit]").as("editForm");
    cy.get("@editForm")
      .find("[data-cy=tx-amount-input]")
      .clear()
      .type(String(editedAmount));
    cy.get("@editForm").find("[data-cy=tx-submit]").click();

    // --- Month N: activity and available now reflect the edited amount ---
    visitBudget();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(-editedAmount));

      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(-editedAmount));
    });

    // --- Month N+1: still unaffected by the edit (no double-count, no leak) ---
    goToNextMonth();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).within(() => {
      cy.get("[data-cy=item-activity]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(0));

      cy.get("[data-cy=item-available]")
        .invoke("text")
        .then((txt) => expect(parseCurrency(txt)).to.eq(0));
    });
  });


  it("Scenario – Multi-month delete & reassignment keeps per-month totals", () => {
    const group = "MultiMonthDeleteGroup";
    const fromItem = "MM-ToDelete";
    const targetItem = "MM-Target";

    const parseCurrency = (text: string): number =>
      Number(text.replace(/[^0-9.-]/g, ""));

    // 1️⃣ Create a dedicated group + two items
    cy.get('[data-cy="add-category-group-button"]').click();
    cy.get('[data-cy="add-category-group-input"]').clear().type(group);
    cy.get('[data-cy="add-category-group-submit"]').click();
    cy.get(
      `tr[data-cy="category-group-row"][data-category="${group}"]`
    ).should("exist");

    const addItem = (name: string) => {
      cy.get(
        `tr[data-cy="category-group-row"][data-category="${group}"]`
      )
        .first()
        .trigger("mouseover");

      cy.get(
        `tr[data-cy="category-group-row"][data-category="${group}"] [data-cy="group-add-item-button"]`
      )
        .filter(":visible")
        .first()
        .then(($btn) => {
          if ($btn.length) {
            cy.wrap($btn).click();
          } else {
            cy.get(
              `tr[data-cy="category-group-row"][data-category="${group}"] [data-cy="group-add-item-button"]`
            )
              .first()
              .click({ force: true });
          }
        });

      cy.get("[data-cy=add-item-input]").clear().type(name);
      cy.get("[data-cy=add-item-submit]").click();
      cy.get(
        `tr[data-cy="category-row"][data-category="${group}"][data-item="${name}"]`
      ).should("exist");
    };

    addItem(fromItem);
    addItem(targetItem);

    const setAssigned = (itemName: string, value: number) => {
      cy.get(
        `tr[data-cy="category-row"][data-item="${itemName}"] span[data-cy="assigned-display"]`
      ).click();
      cy.get(
        `tr[data-cy="category-row"][data-item="${itemName}"] input[data-cy="assigned-input"]`
      )
        .clear()
        .type(String(value) + "{enter}");
    };

    // helpers to snapshot per-month state
    const snapshotMonth = (idx: number) => {
      // snapshot available for fromItem + targetItem and RTA for this month
      cy.get(
        `tr[data-cy="category-row"][data-item="${fromItem}"] [data-cy="item-available"]`
      )
        .invoke("text")
        .then((txt) => {
          cy.wrap(parseCurrency(txt)).as(`m${idx}_from_avail`);
        });

      cy.get(
        `tr[data-cy="category-row"][data-item="${targetItem}"] [data-cy="item-available"]`
      )
        .invoke("text")
        .then((txt) => {
          cy.wrap(parseCurrency(txt)).as(`m${idx}_target_avail`);
        });

      cy.get("[data-cy=ready-to-assign]")
        .invoke("text")
        .then((txt) => {
          cy.wrap(parseCurrency(txt)).as(`m${idx}_rta`);
        });
    };

    // Month 0: assign some amounts
    setAssigned(fromItem, 100);
    setAssigned(targetItem, 20);
    snapshotMonth(0);

    // Month 1
    cy.get("[data-cy=month-next]").click();
    setAssigned(fromItem, 50);
    setAssigned(targetItem, 40);
    snapshotMonth(1);

    // Month 2
    cy.get("[data-cy=month-next]").click();
    setAssigned(fromItem, 30);
    setAssigned(targetItem, 10);
    snapshotMonth(2);

    // 2️⃣ In Month 2, delete fromItem and reassign to targetItem
    cy.get(`tr[data-cy="category-row"][data-item="${fromItem}"]`).then(
      ($row) => {
        if ($row.length) {
          const delBtn = $row.find("[data-cy='delete-item-button']");
          if (delBtn.length) {
            cy.wrap(delBtn).first().click();
          } else {
            cy.wrap($row).rightclick();
            cy.get("[data-cy='category-delete']").first().click({ force: true });
          }

          cy.get("body").then(($b) => {
            if ($b.find("[data-cy='reassign-target-select']").length) {
              cy.get("[data-cy='reassign-target-select']").select(targetItem);
              cy.get("[data-cy='reassign-confirm']").click();
            }
          });
        } else {
          cy.log("From-item row not found; cannot run multi-month delete test");
        }
      }
    );

    let rtaAfterDelete;

    cy.get("[data-cy=ready-to-assign]")
      .invoke("text")
      .then((txt) => {
        rtaAfterDelete = parseCurrency(txt);
      });

    // 3️⃣ Now walk back through months and assert:
    //   - fromItem no longer exists in ANY month
    //   - targetItem available = (previous target + previous from)
    //   - RTA unchanged per month

    // Go back to Month 0
    cy.get("[data-cy=month-prev]").click();
    cy.get("[data-cy=month-prev]").click();

    const assertMonth = (idx: number) => {
      // fromItem removed
      cy.get(
        `tr[data-cy="category-row"][data-item="${fromItem}"]`
      ).should("not.exist");

      // targetItem available = old target + old from
      cy.get(
        `tr[data-cy="category-row"][data-item="${targetItem}"] [data-cy="item-available"]`
      )
        .invoke("text")
        .then((txt) => {
          const availAfter = parseCurrency(txt);
          cy.get<number>(`@m${idx}_from_avail`).then((fromBefore) => {
            cy.get<number>(`@m${idx}_target_avail`).then((targetBefore) => {
              expect(
                availAfter,
                `Month ${idx} target available should equal old target + old from`
              ).to.eq(fromBefore + targetBefore);
            });
          });
        });

      // RTA unchanged in that month
      cy.get("[data-cy=ready-to-assign]")
        .invoke("text")
        .then((txt) => {
          const rtaAfter = parseCurrency(txt);
          expect(rtaAfter, `Month ${idx} RTA should be unchanged by category reassignment`).to.eq(rtaAfterDelete);
        });
    };

    // Month 0
    assertMonth(0);

    // Month 1
    cy.get("[data-cy=month-next]").click();
    assertMonth(1);

    // Month 2
    cy.get("[data-cy=month-next]").click();
    assertMonth(2);
  });


  it("Scenario – Multi-month stress: assignments + middle-month edit keep available consistent across months", () => {
    const groupName = "Stress Group";
    const itemName = "Stress Cat";

    const assignInCurrentMonth = (value: number) => {
      cy.get(
        `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
      ).within(() => {
        cy.get('[data-cy="assigned-display"]').click();
        cy.get('[data-cy="assigned-input"]').clear().type(`${value}{enter}`);
      });
    };

    const assertAvailableEquals = (expected: number) => {
      cy.get(
        `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
      ).within(() => {
        cy.get("[data-cy=item-available]")
          .invoke("text")
          .then((txt) => expect(parseCurrency(txt)).to.eq(expected));
      });
    };

    // --- Month 1: create category and assign 100 ---
    getCurrentMonthLabel().as("m1Label");
    createCategoryInCurrentMonth(groupName, itemName);
    assignInCurrentMonth(100);
    assertAvailableEquals(100); // 100 assigned, no prior history

    // --- Month 2: assign an additional 50 ---
    cy.get("@m1Label").then((oldLabel: any) => {
      goToNextMonth();
      cy.get("[data-cy=month-label]").should("not.contain.text", oldLabel);
    });

    assignInCurrentMonth(50);
    // Available should be prior 100 + current 50 = 150
    assertAvailableEquals(150);

    // --- Month 3: assign an additional 25 ---
    getCurrentMonthLabel().as("m2Label"); // alias for month 2 label, just for clarity
    cy.get("@m2Label").then((oldLabel: any) => {
      goToNextMonth();
      cy.get("[data-cy=month-label]").should("not.contain.text", oldLabel);
    });

    assignInCurrentMonth(25);
    // Available: 100 (M1) + 50 (M2) + 25 (M3) = 175
    assertAvailableEquals(175);

    // --- Navigate back to Month 2 and change assigned from 50 -> 30 ---
    goToPrevMonth();
    // We are now back on Month 2 for the same category
    assignInCurrentMonth(30);
    // New available for Month 2: 100 (M1) + 30 (M2) = 130
    assertAvailableEquals(130);

    // --- Month 3 must recompute based on new cumulative sums ---
    getCurrentMonthLabel().as("m2LabelAfterEdit");
    cy.get("@m2LabelAfterEdit").then((oldLabel: any) => {
      goToNextMonth();
      cy.get("[data-cy=month-label]").should("not.contain.text", oldLabel);
    });

    // Cumulative assigned now: 100 (M1) + 30 (M2) + 25 (M3) = 155
    assertAvailableEquals(155);

    // --- And Month 1 remains unchanged at 100 ---
    goToPrevMonth(); // back to Month 2
    goToPrevMonth(); // back to Month 1
    assertAvailableEquals(100);
  });

  it("keeps multi-month available math consistent when a Month 1 transaction changes category (deep history mutation)", () => {
    const groupName = "Deep History Group";
    const oldItem = "Old Cat";
    const newItem = "New Cat";
    const amount = 40;
    const readySelector = "[data-cy=ready-to-assign]";

    const rowSelectorOld = (g: string, i: string) =>
      `tr[data-cy="category-row"][data-category="${g}"][data-item="${i}"]`;
    const rowSelectorNew = rowSelectorOld;

    const snapshotMonth = (key: string) => {
      // key: e.g. "m1_before", "m2_after"
      cy.get(
        `${rowSelectorOld(groupName, oldItem)} [data-cy="item-available"]`
      )
        .invoke("text")
        .then((txt) => {
          cy.wrap(parseCurrency(txt)).as(`${key}_oldAvail`);
        });

      cy.get(
        `${rowSelectorNew(groupName, newItem)} [data-cy="item-available"]`
      )
        .invoke("text")
        .then((txt) => {
          cy.wrap(parseCurrency(txt)).as(`${key}_newAvail`);
        });

      cy.get(readySelector)
        .invoke("text")
        .then((txt) => {
          cy.wrap(parseCurrency(txt)).as(`${key}_rta`);
        });
    };

    // 1️⃣ Month 1 – create categories + spend in Old Cat
    visitBudget();

    cy.get("[data-cy=add-category-group-button]").click();
    cy.get("[data-cy=add-category-group-input]").clear().type(groupName);
    cy.get("[data-cy=add-category-group-submit]").click();

    // Add Old Cat
    cy.get(
      `tr[data-cy="category-group-row"][data-category="${groupName}"]`
    )
      .first()
      .trigger("mouseover");

    cy.get(
      `tr[data-cy="category-group-row"][data-category="${groupName}"] [data-cy="group-add-item-button"]`
    )
      .filter(":visible")
      .first()
      .then(($btn) => {
        if ($btn.length) {
          cy.wrap($btn).click();
        } else {
          cy.get(
            `tr[data-cy="category-group-row"][data-category="${groupName}"] [data-cy="group-add-item-button"]`
          )
            .first()
            .click({ force: true });
        }
      });

    cy.get("[data-cy=add-item-input]").type(oldItem);
    cy.get("[data-cy=add-item-submit]").click();

    // Add New Cat
    cy.get(
      `tr[data-cy="category-group-row"][data-category="${groupName}"]`
    )
      .first()
      .trigger("mouseover");

    cy.get(
      `tr[data-cy="category-group-row"][data-category="${groupName}"] [data-cy="group-add-item-button"]`
    )
      .filter(":visible")
      .first()
      .then(($btn) => {
        if ($btn.length) {
          cy.wrap($btn).click();
        } else {
          cy.get(
            `tr[data-cy="category-group-row"][data-category="${groupName}"] [data-cy="group-add-item-button"]`
          )
            .first()
            .click({ force: true });
        }
      });

    cy.get("[data-cy=add-item-input]").type(newItem);
    cy.get("[data-cy=add-item-submit]").click();

    // Create a Month 1 transaction in Old Cat
    visitAccount(accounts.checking.id, accounts.checking.name);

    cy.get("[data-cy=add-transaction-button]").click();
    cy.get("[data-cy=tx-payee-select]").select("__new__");
    cy.get("[data-cy=tx-new-payee-input]").type("Deep History Store");
    cy.get("[data-cy=tx-item-select]").select(`${groupName}::${oldItem}`);
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      if ($btn.text().trim() !== "−") cy.wrap($btn).click();
    });
    cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
    cy.get("[data-cy=tx-submit]").click();

    // 2️⃣ Snapshot BEFORE – Months 1, 2, 3
    visitBudget();
    snapshotMonth("m1_before");

    // Month 2
    cy.get("[data-cy=month-next]").click();
    snapshotMonth("m2_before");

    // Month 3
    cy.get("[data-cy=month-next]").click();
    snapshotMonth("m3_before");

    // 3️⃣ Go back to Month 1 and change the transaction from Old Cat → New Cat
    cy.get("[data-cy=month-prev]").click(); // back to Month 2
    cy.get("[data-cy=month-prev]").click(); // back to Month 1

    visitAccount(accounts.checking.id, accounts.checking.name);

    cy.get("[data-cy=transaction-row]").first().as("txRow");
    cy.get("@txRow").rightclick();
    cy.get("[data-cy=context-edit-transaction]").click();
    cy.get("[data-cy=transaction-form-row-edit]").as("editForm");

    cy.get("@editForm").find("[data-cy=tx-item-select]").select(`${groupName}::${newItem}`);
    // keep same amount; only category changes
    cy.get("@editForm").find("[data-cy=tx-submit]").click();

    // 4️⃣ Snapshot AFTER – Months 1, 2, 3
    visitBudget();
    snapshotMonth("m1_after");

    cy.get("[data-cy=month-next]").click();
    snapshotMonth("m2_after");

    cy.get("[data-cy=month-next]").click();
    snapshotMonth("m3_after");

    const months = ["m1", "m2", "m3"];

    months.forEach((m, index) => {
      // Only month 1 should actually see the +/- amount at the category level.
      // Months 2 and 3 keep category available at 0; the impact is in RTA only.
      const delta = index === 0 ? amount : 0;

      // Old category: should get "less negative" in month 1, unchanged later
      cy.get<number>(`@${m}_before_oldAvail`).then((oldBefore) => {
        cy.get<number>(`@${m}_after_oldAvail`).then((oldAfter) => {
          expect(oldAfter).to.eq(oldBefore + delta);
        });
      });

      // New category: should get "more negative" in month 1, unchanged later
      cy.get<number>(`@${m}_before_newAvail`).then((newBefore) => {
        cy.get<number>(`@${m}_after_newAvail`).then((newAfter) => {
          expect(newAfter).to.eq(newBefore - delta);
        });
      });

      // RTA should be identical before/after in every month
      cy.get<number>(`@${m}_before_rta`).then((rtaBefore) => {
        cy.get<number>(`@${m}_after_rta`).then((rtaAfter) => {
          expect(rtaAfter).to.eq(rtaBefore);
        });
      });
    });
  });



});
