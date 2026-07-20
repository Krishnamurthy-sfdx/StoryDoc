# SCRUM-1 — Customer Subscription Lifecycle Management

Salesforce-native subscription lifecycle: data model and security (AC-1), automated
subscription creation on Closed Won (AC-2), and renewal automation (AC-3).

Deployed to a real org: 46/46 components. No Apex — the Account roll-ups are
native roll-up summary fields over a master-detail relationship.

## What was built

### AC-1 — Data model and security

| Component        | API name                                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom object    | `Subscription__c` (auto-number `SUB-{0000}`, reports, activities, field history, search)                                                                                                                             |
| Fields           | `Start_Date__c`, `End_Date__c`, `MRR__c`, `Status__c`, `Account__c`, `Opportunity__c`, `Renewal_Type__c`, `Product__c`, `Term_Months__c`, `Days_Until_Expiry__c`, `Renewal_Contact__c`, `Last_Reminder_Sent_Date__c` |
| Account roll-ups | `Total_MRR__c`, `Active_Subscription_Count__c`                                                                                                                                                                       |
| Validation rules | `End_Date_After_Start_Date`, `MRR_Must_Be_Positive`, `Status_Change_Guard`                                                                                                                                           |
| Permission sets  | `Subscription_Manager`, `Subscription_Viewer`, `Subscription_Admin`, `Subscription_Automation_Bypass`                                                                                                                |
| UI               | `Subscription_Record_Page` flexipage, `Subscription_Compact` compact layout, page layouts for Subscription, Account and Opportunity                                                                                  |

### AC-2 — `Create_Subscription_On_Closed_Won`

Record-triggered flow, Opportunity **after save**, entry criteria `StageName = Closed Won`
with "only when a record is updated to meet the criteria", so it fires on the transition
into Closed Won rather than on every save of a won record.

Skips everything when the running user holds the `Bypass_Subscription_Flow` custom
permission. Maps account, opportunity, close date, derived end date, derived MRR,
product, term and `Status__c = Active`, then writes the new subscription Id back to
`Opportunity.Subscription__c`.

Both DML elements have fault paths that create an `Error_Log__c` row
(`Source_Flow__c`, `Record_Id__c`, `Error_Message__c`, `Timestamp__c`) and a
Sales Ops task titled `Subscription auto-creation failed for Opp: {OppName}`.

### AC-3 — `Daily_Subscription_Expiry_Check`

Scheduled flow, daily at 06:00 org time, over subscriptions that are neither Expired
nor Cancelled and have an end date. Records already reminded today are skipped via
`Last_Reminder_Sent_Date__c`.

Thresholds are evaluated most-urgent-first so each record takes exactly one branch:

| Condition              | Action                                                        |
| ---------------------- | ------------------------------------------------------------- |
| `End_Date__c <= TODAY` | `Status__c = Expired`                                         |
| ≤ 7 days               | Urgent task, stamp reminder date                              |
| ≤ 30 days              | High task, stamp reminder date                                |
| ≤ 60 days              | Normal task, `Status__c = Expiring Soon`, stamp reminder date |

Task subject: `Subscription Renewal: {Account.Name} – {Subscription.Name} expires in {X} days`,
owned by `Account.OwnerId`, due on `End_Date__c`, related to the subscription, with
`WhoId` set from `Renewal_Contact__c` when populated.

## Deviations from the story, and why

These are places where the written requirement is not directly expressible on the
platform. Each was resolved in the way that preserves the intent.

**`Account__c` is a master-detail relationship.** The story described it as a
lookup, but native roll-up summary fields require master-detail. Master-detail was
chosen so `Total_MRR__c` and `Active_Subscription_Count__c` are real roll-up
summaries maintained by the platform — no Apex, no trigger, no test to maintain.
Consequences: `Subscription__c` uses `ControlledByParent` sharing, subscriptions are
deleted with their account, and the relationship is re-parentable.

**The failure task is owned by the running user.** Salesforce does not support
queue ownership of Tasks. Rather than introduce configuration for this, the fault
path leaves `OwnerId` unset, so the task belongs to whoever saved the opportunity —
the person best placed to notice it.

**`Status__c` is not a required field.** Salesforce rejects field-level security on
required fields, and the story requires Status to be read-only via FLS. Status is
therefore optional with `Active` as its picklist default, and FLS makes it read-only
in `Subscription_Manager` and `Subscription_Viewer`. `Subscription_Admin` grants edit
so admins can correct records.

**Required fields are absent from the permission sets.** `Start_Date__c`,
`End_Date__c`, `MRR__c` and `Account__c` are required, so Salesforce refuses to
deploy FLS entries for them — they are always visible and editable by design.

**Renewal type comes from the custom field only.** The story allowed "Opportunity
Record Type _or_ custom field". `$Record.RecordType.DeveloperName` is not a valid
flow formula reference, so `Opportunity.Renewal_Type__c` drives it, defaulting to
`New Business`.

**`Status_Change_Guard` exempts bypass holders.** Otherwise the rule would block
legitimate data loads. The scheduled flow is unaffected because it only sets Expired
once `Days_Until_Expiry__c <= 0`.

**Dedicated layouts, so nothing existing is overwritten.** The Account and
Opportunity changes ship as _new_ layouts — `Account Subscription Layout` and
`Opportunity Subscription Layout` — rather than modifying the org's existing
layouts. Assign them to profiles as needed; no current layout is touched.

**`Urgent` was added to the TaskPriority standard value set.** It is not a standard
value. The shipped set is Urgent, High, Normal and Low — the org's existing three
values are all preserved, so this is purely additive.

## Lightning app

`Subscription Management` (`Subscription_Management`) groups the story's objects into
one app: Home, Subscriptions, Accounts, Opportunities, Contacts, Cases, Tasks,
Error Logs, Reports and Dashboards. App visibility is granted by the Subscription
Manager, Viewer and Admin permission sets, so assigning any of those makes the app
appear in the App Launcher.

## Post-deployment steps

1. Assign `Subscription_Manager` to CSMs and Sales Ops, `Subscription_Viewer` to
   Sales Reps and Support, `Subscription_Automation_Bypass` to integration and
   migration users.
2. Confirm `Daily_Subscription_Expiry_Check` is scheduled for 06:00 in the org
   timezone; the schedule start date is 2026-07-21.
3. Activate the `Subscription_Record_Page` as the org default for `Subscription__c`.
4. Assign `Account Subscription Layout` and `Opportunity Subscription Layout` to the
   relevant profiles.
5. Open the App Launcher and confirm the **Subscription Management** app is visible
   to the assigned users.

## Verification

```bash
sf project deploy start --dry-run --source-dir force-app
```

Deployed to the org on 2026-07-20: 46/46 components. The Account roll-ups were
confirmed in the org as `Roll-Up Summary (SUM Subscription)` and
`Roll-Up Summary (COUNT Subscription)`.
