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

const goToNextMonth = () => cy.get("[data-cy=month-next]").filter(':visible').first().click();
const goToPrevMonth = () => cy.get("[data-cy=month-prev]").filter(':visible').first().click();
const getCurrentMonthLabel = () => cy.get("[data-cy=month-label]").invoke("text");

// Helper: create a category group + item in current month via Budget UI
// Add-category-group-* live in the card header, not inside [data-cy=budget-table], so use cy.get not budgetFind
const createCategoryInCurrentMonth = (groupName: string, itemName: string) => {
  cy.createCategory(groupName, itemName);
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
    cy.setAssignedValue(groupName, itemName, amount);

    // Assert month N state
    cy.budgetRow(groupName, itemName).within(() => {
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

    cy.budgetRow(groupName, itemName)
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
    cy.selectPayee("Overspend Store");
    cy.selectCategory(`${groupName}::${itemName}`);
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      const isNegative = $btn.attr("data-state") === "negative";
      if (!isNegative) cy.wrap($btn).click();
    });
    cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
    cy.get("[data-cy=tx-submit]").click();

    // Month N category shows negative available
    visitBudget();
    cy.budgetRow(groupName, itemName).within(() => {
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
    cy.budgetRow(groupName, itemName).within(() => {
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
    cy.selectPayee("Scoped Store");
    cy.selectCategory(`${groupName}::${itemName}`);
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      const isNegative = $btn.attr("data-state") === "negative";
      if (!isNegative) cy.wrap($btn).click();
    });
    cy.get("[data-cy=tx-amount-input]").clear().type(String(initialAmount));
    cy.get("[data-cy=tx-submit]").click();

    // --- Month N: activity and available reflect the original amount ---
    visitBudget();
    cy.get(
      `[data-cy="category-row"][data-category="${groupName}"][data-item="${itemName}"]`
    ).first().within(() => {
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
    ).first().within(() => {
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
    cy.get("@txRow").first().scrollIntoView().rightclick();
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
    ).first().within(() => {
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
    ).first().within(() => {
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
    const readAvailable = (itemName: string, alias: string) => {
      cy.budgetRow(group, itemName)
        .find("[data-cy=item-available]")
        .first()
        .should(($el) => {
          const value = parseCurrency($el.text());
          expect(value, "available should be numeric").to.not.be.NaN;
        })
        .invoke("text")
        .then((txt) => {
          cy.wrap(parseCurrency(txt)).as(alias);
        });
    };

    // 1️⃣ Create a dedicated group + two items (add-category-group-* are in header, not inside budget-table)
    cy.createCategoryGroup(group);
    cy.get(
      `tr[data-cy="category-group-row"][data-category="${group}"]`
    ).should("exist");

    const addItem = (name: string) => {
      cy.createCategoryItem(group, name);
      cy.budgetRow(group, name).should('exist');
    };

    addItem(fromItem);
    addItem(targetItem);

    const setAssigned = (itemName: string, value: number) => {
      cy.setAssignedValue(group, itemName, value);
    };

    // helpers to snapshot per-month state
    const snapshotMonth = (idx: number) => {
      // snapshot available for fromItem + targetItem and RTA for this month
      readAvailable(fromItem, `m${idx}_from_avail`);
      readAvailable(targetItem, `m${idx}_target_avail`);

      cy.getReadyToAssignValue().then((value) => {
        cy.wrap(value).as(`m${idx}_rta`);
      });
    };

    // Month 0: assign some amounts
    setAssigned(fromItem, 100);
    setAssigned(targetItem, 20);
    snapshotMonth(0);

    // Month 1
    cy.get("[data-cy=month-next]").filter(':visible').first().click();
    setAssigned(fromItem, 50);
    setAssigned(targetItem, 40);
    snapshotMonth(1);

    // Month 2
    cy.get("[data-cy=month-next]").filter(':visible').first().click();
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
            cy.budgetRightClick(
              `tr[data-cy="category-row"][data-item="${fromItem}"]`
            );
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

    cy.getReadyToAssignValue().then((value) => {
      cy.wrap(value).as("rtaAfterDelete");
    });

    // 3️⃣ Now walk back through months and assert:
    //   - fromItem no longer exists in ANY month
    //   - targetItem available = (previous target + previous from)
    //   - RTA unchanged per month

    // Go back to Month 0
    cy.get("[data-cy=month-prev]").filter(':visible').first().click();
    cy.get("[data-cy=month-prev]").filter(':visible').first().click();

    const assertMonth = (idx: number) => {
      // fromItem removed
      cy.get(
        `tr[data-cy="category-row"][data-item="${fromItem}"]`
      ).should("not.exist");

      // targetItem available = old target + old from
      cy.budgetRow(group, targetItem)
        .find("[data-cy=item-available]")
        .first()
        .should(($el) => {
          const value = parseCurrency($el.text());
          expect(value, "available should be numeric").to.not.be.NaN;
        })
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
      cy.getReadyToAssignValue().then((rtaAfter) => {
        cy.get<number>("@rtaAfterDelete").then((rtaAfterDelete) => {
          expect(rtaAfter, `Month ${idx} RTA should be unchanged by category reassignment`).to.eq(rtaAfterDelete);
        });
      });
    };

    // Month 0
    assertMonth(0);

    // Month 1
    cy.get("[data-cy=month-next]").filter(':visible').first().click();
    assertMonth(1);

    // Month 2
    cy.get("[data-cy=month-next]").filter(':visible').first().click();
    assertMonth(2);
  });


  it("Scenario – Multi-month stress: assignments + middle-month edit keep available consistent across months", () => {
    const groupName = "Stress Group";
    const itemName = "Stress Cat";

    const assignInCurrentMonth = (value: number) => {
      cy.setAssignedValue(groupName, itemName, value);
    };

    const assertAvailableEquals = (expected: number) => {
      cy.budgetRow(groupName, itemName).within(() => {
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
    const rowSelectorOld = (g: string, i: string) =>
      `tr[data-cy="category-row"][data-category="${g}"][data-item="${i}"]`;
    const rowSelectorNew = rowSelectorOld;
    const parseCurrencySafe = (text: string) => {
      const value = parseCurrency(text);
      return Number.isNaN(value) ? 0 : value;
    };

    const snapshotMonth = (key: string) => {
      // key: e.g. "m1_before", "m2_after"
      cy.get("[data-cy=month-label]")
        .invoke("text")
        .then((label) => {
          cy.log(`Snapshot ${key} (month: ${label.trim()})`);
        });
      cy.get(
        `${rowSelectorOld(groupName, oldItem)} [data-cy="item-available"]`
      )
        .invoke("text")
        .then((txt) => {
          cy.wrap(parseCurrencySafe(txt)).as(`${key}_oldAvail`);
        });

      cy.get(
        `${rowSelectorNew(groupName, newItem)} [data-cy="item-available"]`
      )
        .invoke("text")
        .then((txt) => {
          cy.wrap(parseCurrencySafe(txt)).as(`${key}_newAvail`);
        });

      cy.getReadyToAssignValue().then((value) => {
        cy.wrap(value).as(`${key}_rta`);
      });
    };

    // 1️⃣ Month 1 – create categories + spend in Old Cat
    visitBudget();

    cy.createCategoryGroup(groupName);
    cy.createCategoryItem(groupName, oldItem);
    cy.createCategoryItem(groupName, newItem);

    // Create a Month 1 transaction in Old Cat
    visitAccount(accounts.checking.id, accounts.checking.name);

    cy.get("[data-cy=add-transaction-button]").click();
    cy.selectPayee("Deep History Store");
    cy.selectCategory(`${groupName}::${oldItem}`);
    cy.get("[data-cy=tx-sign-toggle]").then(($btn) => {
      const isNegative = $btn.attr("data-state") === "negative";
      if (!isNegative) cy.wrap($btn).click();
    });
    cy.get("[data-cy=tx-amount-input]").clear().type(String(amount));
    cy.get("[data-cy=tx-submit]").click();

    // 2️⃣ Snapshot BEFORE – Months 1, 2, 3
    visitBudget();
    snapshotMonth("m1_before");
    getCurrentMonthLabel().as("dh_m1_label");

    // Month 2
    cy.get("@dh_m1_label").then((oldLabel: any) => {
      goToNextMonth();
      cy.get("[data-cy=month-label]").should("not.contain.text", oldLabel);
    });
    snapshotMonth("m2_before");
    getCurrentMonthLabel().as("dh_m2_label");

    // Month 3
    cy.get("@dh_m2_label").then((oldLabel: any) => {
      goToNextMonth();
      cy.get("[data-cy=month-label]").should("not.contain.text", oldLabel);
    });
    snapshotMonth("m3_before");

    // 3️⃣ Go back to Month 1 and change the transaction from Old Cat → New Cat
    cy.get("[data-cy=month-prev]").filter(':visible').first().click(); // back to Month 2
    cy.get("[data-cy=month-prev]").filter(':visible').first().click(); // back to Month 1

    visitAccount(accounts.checking.id, accounts.checking.name);

    cy.get("[data-cy=transaction-row]").first().as("txRow");
    cy.get("@txRow").first().scrollIntoView().rightclick();
    cy.get("[data-cy=context-edit-transaction]").click();
    cy.get("[data-cy=transaction-form-row-edit]").as("editForm");

    cy.get("@editForm").find("[data-cy=tx-item-select]").selectCategory(`${groupName}::${newItem}`);
    // keep same amount; only category changes
    cy.get("@editForm").find("[data-cy=tx-submit]").click();

    // 4️⃣ Snapshot AFTER – Months 1, 2, 3
    visitBudget();
    snapshotMonth("m1_after");
    getCurrentMonthLabel().as("dh_m1_after_label");

    cy.get("@dh_m1_after_label").then((oldLabel: any) => {
      goToNextMonth();
      cy.get("[data-cy=month-label]").should("not.contain.text", oldLabel);
    });
    snapshotMonth("m2_after");
    getCurrentMonthLabel().as("dh_m2_after_label");

    cy.get("@dh_m2_after_label").then((oldLabel: any) => {
      goToNextMonth();
      cy.get("[data-cy=month-label]").should("not.contain.text", oldLabel);
    });
    snapshotMonth("m3_after");

    cy.wrap(["m1", "m2", "m3"]).each((m, index) => {
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
