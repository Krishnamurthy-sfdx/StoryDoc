# SCRUM-1 Implementation Summary

Customer Subscription Lifecycle Management — Salesforce-native implementation.

|                |                                                              |
| -------------- | ------------------------------------------------------------ |
| Branch         | `feature/story-001` (from `main`)                            |
| Metadata files | 46                                                           |
| Deployment     | **Deployed to the org — 46/46 components succeeded**         |
| Apex           | None. The Account roll-ups are native roll-up summary fields |

Everything below was built as part of this story.

```bash
sf project deploy start --source-dir force-app
```

---

## 1. Custom objects

### `Subscription__c`

Auto-number name `SUB-{0000}`, label "Subscription". Reports, Activities, Field
History Tracking, Search and Bulk API enabled. Sharing model `ControlledByParent`
(inherited from the Account master-detail).

| Field                        | Type                       | Notes                                                                            |
| ---------------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| `Account__c`                 | **Master-Detail(Account)** | Required by definition, re-parentable, cascade delete                            |
| `Start_Date__c`              | Date                       | Required, history tracked                                                        |
| `End_Date__c`                | Date                       | Required, history tracked                                                        |
| `MRR__c`                     | Currency(16,2)             | Required, history tracked                                                        |
| `Status__c`                  | Picklist                   | Active (default), Expiring Soon, Expired, Cancelled. Restricted, history tracked |
| `Opportunity__c`             | Lookup(Opportunity)        | Optional                                                                         |
| `Renewal_Type__c`            | Picklist                   | New Business (default), Renewal, Upsell. Restricted                              |
| `Product__c`                 | Text(255)                  |                                                                                  |
| `Term_Months__c`             | Number(3,0)                |                                                                                  |
| `Days_Until_Expiry__c`       | Formula (Number)           | `End_Date__c - TODAY()`                                                          |
| `Renewal_Contact__c`         | Lookup(Contact)            | Optional                                                                         |
| `Last_Reminder_Sent_Date__c` | Date                       | Deduplication key for the daily job                                              |

### `Error_Log__c`

Auto-number name `ERR-{00000}`. Central log for automation failures. Private
sharing model.

Fields: `Source_Flow__c` (Text 255), `Record_Id__c` (Text 18),
`Error_Message__c` (Long Text Area 32768), `Timestamp__c` (DateTime, defaults to
`NOW()`).

---

## 2. Fields added to existing objects

| Object      | Field                          | Type                    | Purpose                                                  |
| ----------- | ------------------------------ | ----------------------- | -------------------------------------------------------- |
| Account     | `Total_MRR__c`                 | **Roll-Up Summary**     | `SUM(Subscription__c.MRR__c)` where `Status__c = Active` |
| Account     | `Active_Subscription_Count__c` | **Roll-Up Summary**     | `COUNT(Subscription__c)` where `Status__c = Active`      |
| Opportunity | `Subscription__c`              | Lookup(Subscription__c) | Back-link written by the creation flow                   |
| Opportunity | `Term_Months__c`               | Number(3,0)             | Drives end date and MRR derivation                       |
| Opportunity | `Product_Name__c`              | Text(255)               | Product, with line-item fallback                         |
| Opportunity | `Renewal_Type__c`              | Picklist                | Drives `Subscription__c.Renewal_Type__c`                 |
| Case        | `Subscription__c`              | Lookup(Subscription__c) | Powers the Cases related list                            |

Both roll-ups are maintained by the platform. Verified in the org as
`Roll-Up Summary (SUM Subscription)` and `Roll-Up Summary (COUNT Subscription)`.
No Apex, no trigger, no test to maintain.

---

## 3. Validation rules

| Rule                        | Fires when                                                                                                   | Message                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `End_Date_After_Start_Date` | `End_Date__c < Start_Date__c` (both populated)                                                               | End Date cannot be earlier than Start Date.                                                          |
| `MRR_Must_Be_Positive`      | `MRR__c <= 0`                                                                                                | MRR must be greater than zero.                                                                       |
| `Status_Change_Guard`       | Status changed to Expired while `Days_Until_Expiry__c > 0`, and the user does not hold the bypass permission | Status cannot be set to Expired while the subscription still has days remaining before its End Date. |

---

## 4. Flow — `Create_Subscription_On_Closed_Won`

Record-triggered, Opportunity, **after save**, `CreateAndUpdate`, entry criteria
`StageName = Closed Won` with "only when a record is updated to meet the criteria",
so it fires on the transition into Closed Won rather than on every save.

1. **Check Bypass Permission** — exits immediately when the running user holds
   `Bypass_Subscription_Flow`.
2. **Check Product Name** — uses `Opportunity.Product_Name__c`, or falls back to
   the earliest `OpportunityLineItem` name when blank.
3. **Create Subscription** — maps:
   - `Account__c` ← `Opportunity.AccountId`
   - `Opportunity__c` ← `Opportunity.Id`
   - `Start_Date__c` ← `Opportunity.CloseDate`
   - `End_Date__c` ← `CloseDate + (Term_Months × 30)`
   - `MRR__c` ← `Amount / Term_Months`
   - `Product__c`, `Term_Months__c`, `Renewal_Type__c`
   - `Status__c` = `Active`
4. **Link Subscription To Opportunity** — writes the new Id to
   `Opportunity.Subscription__c`.

Derivation formulas: `fxTermMonths` (opportunity term, defaulting to 12),
`fxEndDate`, `fxMrr`, `fxRenewalType`, `fxFailureTaskSubject`,
`fxFailureTaskDescription`.

**Fault path** (on both DML elements) → creates an `Error_Log__c` row with
`Source_Flow__c`, `Record_Id__c`, `Error_Message__c` and `Timestamp__c` → creates a
High priority task `Subscription auto-creation failed for Opp: {OppName}` related to
the opportunity. The task's owner is left unset, so it belongs to **whoever saved
the opportunity**.

---

## 5. Flow — `Daily_Subscription_Expiry_Check`

Scheduled flow, **daily at 06:00** org time (schedule start date 2026-07-21).

Entry filters: `Status__c != Expired` AND `Status__c != Cancelled` AND
`End_Date__c != null` — equivalent to the Active / Expiring Soon set.

**Deduplication** — records where `Last_Reminder_Sent_Date__c = TODAY` exit
immediately.

Thresholds are evaluated most-urgent-first, so each record takes exactly one branch:

| Condition              | Actions                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| `End_Date__c <= TODAY` | `Status__c = Expired`                                                          |
| ≤ 7 days               | Urgent task + stamp `Last_Reminder_Sent_Date__c`                               |
| ≤ 30 days              | High task + stamp `Last_Reminder_Sent_Date__c`                                 |
| ≤ 60 days              | Normal task + `Status__c = Expiring Soon` + stamp `Last_Reminder_Sent_Date__c` |

Every renewal task uses subject
`Subscription Renewal: {Account.Name} – {Subscription.Name} expires in {X} days`,
owner `Account.OwnerId` (as the story specifies), due date `End_Date__c`,
`WhatId` = the subscription, and `WhoId` = `Renewal_Contact__c` when populated.

All four DML elements have fault connectors writing to `Error_Log__c` with
`Source_Flow__c = Daily_Subscription_Expiry_Check`.

---

## 6. Security

| Permission set                   | Grants                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Subscription_Manager`           | Full CRUD on `Subscription__c`, read on `Error_Log__c`, **`Status__c` read-only via FLS**, Subscription tab, app visibility |
| `Subscription_Viewer`            | Read-only on `Subscription__c`, all fields read-only, Subscription tab, app visibility                                      |
| `Subscription_Admin`             | Full CRUD with **`Status__c` editable**, full `Error_Log__c` access, both tabs, app visibility                              |
| `Subscription_Automation_Bypass` | The `Bypass_Subscription_Flow` custom permission, for data-migration and integration users                                  |

All three subscription permission sets also grant read on Account and Contact,
which the platform requires because `Subscription__c` is a detail of Account.

**Custom permission** `Bypass_Subscription_Flow` — skips the creation flow and
exempts the holder from `Status_Change_Guard`.

Notes on what is _not_ in the permission sets, by platform rule:

- `Start_Date__c`, `End_Date__c`, `MRR__c` and `Account__c` are required (or
  master-detail), so FLS entries cannot be deployed for them — they are always
  visible and editable.
- The Account roll-up summaries are read-only by nature.
- Record visibility on `Subscription__c` is inherited from the Account, so no
  View All / Modify All is granted.

---

## 7. User interface

| Component                                        | Detail                                                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `Subscription_Compact` compact layout            | Record Name, Account, Status, MRR, End Date                                                                                  |
| `Subscription_Record_Page` Lightning record page | Highlights panel, record detail, Activities panel, related lists                                                             |
| `Subscription Layout`                            | Two sections (details, term) plus System Information; Activities, History and Cases related lists                            |
| **`Account Subscription Layout`**                | New layout — Subscription Summary section with both roll-ups, plus the Subscriptions related list                            |
| **`Opportunity Subscription Layout`**            | New layout — Subscription Terms section (Term, Product Name, Renewal Type, Subscription) plus the Subscriptions related list |
| List views                                       | `All Subscriptions`, `Expiring Soon`                                                                                         |
| Tabs                                             | `Subscription__c`, `Error_Log__c`                                                                                            |

The Account and Opportunity changes ship as **new, separately named layouts**, so
no existing layout in the org is modified. Assign them to profiles as needed.

**`Urgent`** was added to the `TaskPriority` standard value set for the 7-day
threshold. The org's existing High, Normal and Low values are all preserved, so
this is purely additive.

---

## 8. Lightning app

**`Subscription Management`** — Lightning app, standard navigation, brand colour
`#0176D3`.

Tabs: Home, **Subscriptions**, Accounts, Opportunities, Contacts, Cases, Tasks,
**Error Logs**, Reports, Dashboards.

Visibility is granted by the Subscription Manager, Viewer and Admin permission
sets, so assigning any of them surfaces the app in the App Launcher.

---

## 9. Complete file inventory (46 files)

**Applications** — `Subscription_Management.app-meta.xml`

**Custom permissions** — `Bypass_Subscription_Flow.customPermission-meta.xml`

**FlexiPages** — `Subscription_Record_Page.flexipage-meta.xml`

**Flows** — `Create_Subscription_On_Closed_Won.flow-meta.xml`,
`Daily_Subscription_Expiry_Check.flow-meta.xml`

**Layouts** — `Account-Account Subscription Layout`,
`Opportunity-Opportunity Subscription Layout`,
`Subscription__c-Subscription Layout`

**Objects** — `Subscription__c` (object, 12 fields, 3 validation rules,
1 compact layout, 2 list views), `Error_Log__c` (object + 4 fields),
`Account` (2 roll-up summary fields), `Opportunity` (4 fields), `Case` (1 field)

**Permission sets** — `Subscription_Admin`, `Subscription_Automation_Bypass`,
`Subscription_Manager`, `Subscription_Viewer`

**Standard value sets** — `TaskPriority.standardValueSet-meta.xml`

**Tabs** — `Subscription__c`, `Error_Log__c`

**Docs** — `docs/SCRUM-1-subscription-lifecycle.md`, `IMPLEMENTATION_SUMMARY.md`

---

## 10. Post-deployment configuration

1. Assign `Subscription_Manager` to CSMs and Sales Ops, `Subscription_Viewer` to
   Sales Reps and Support, `Subscription_Automation_Bypass` to integration and
   migration users.
2. Assign `Account Subscription Layout` and `Opportunity Subscription Layout` to
   the relevant profiles.
3. Activate `Subscription_Record_Page` as the org default for `Subscription__c`.
4. Confirm `Daily_Subscription_Expiry_Check` is scheduled for 06:00 in the org
   timezone.
5. Confirm the **Subscription Management** app appears in the App Launcher.

Because `Account__c` is a master-detail, deleting an Account cascades to its
subscriptions, and subscription record visibility follows the Account's sharing.

Full rationale for every design decision is in
`docs/SCRUM-1-subscription-lifecycle.md`.
