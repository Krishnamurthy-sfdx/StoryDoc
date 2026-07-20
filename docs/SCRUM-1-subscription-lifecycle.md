# SCRUM-1 — Customer Subscription Lifecycle Management

Salesforce-native subscription lifecycle: data model and security (AC-1), automated
subscription creation on Closed Won (AC-2), and renewal automation (AC-3).

Validated with `sf project deploy start --dry-run` against a real org: 52/52
components valid, 7/7 Apex tests passing.

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

**Roll-ups are Apex, not roll-up summary fields.** Roll-up summary fields require a
master-detail relationship, but the story specifies `Account__c` as a _lookup_.
Keeping the lookup, `SubscriptionRollupService` + `SubscriptionTrigger` recalculate
`Total_MRR__c` and `Active_Subscription_Count__c` for Active subscriptions. The
trigger is bulk-safe (one aggregate query per transaction) and handles insert,
update, delete, undelete and re-parenting. Covered by `SubscriptionRollupServiceTest`.

**The Sales Ops failure task goes to a user, not a queue.** Salesforce does not
support queue ownership of Tasks. The `Subscription_Automation__mdt.Default` record
carries `Sales_Ops_Owner_Id__c`; the flow assigns that user and falls back to the
opportunity owner when it is blank. **Set this value after deploying.** A `Sales_Ops`
queue is included for `Error_Log__c` ownership.

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

**Standard layouts are replaced, not merged.** Deploying `Account-Account Layout` and
`Opportunity-Opportunity Layout` overwrites those layouts in the target org. Review
them against the destination org before deploying to production.

**`Urgent` was added to the TaskPriority standard value set.** It is not a standard
value. `standardValueSets/TaskPriority` includes Urgent, High, Normal and Low —
deploying it replaces the org's existing set.

## Lightning app

`Subscription Management` (`Subscription_Management`) groups the story's objects into
one app: Home, Subscriptions, Accounts, Opportunities, Contacts, Cases, Tasks,
Error Logs, Reports and Dashboards. App visibility is granted by the Subscription
Manager, Viewer and Admin permission sets, so assigning any of those makes the app
appear in the App Launcher.

## Post-deployment steps

1. Populate `Subscription_Automation__mdt.Default.Sales_Ops_Owner_Id__c` with the
   Sales Ops user Id.
2. Assign `Subscription_Manager` to CSMs and Sales Ops, `Subscription_Viewer` to
   Sales Reps and Support, `Subscription_Automation_Bypass` to integration and
   migration users.
3. Add members to the `Sales_Ops` queue.
4. Confirm `Daily_Subscription_Expiry_Check` is scheduled for 06:00 in the org
   timezone; the schedule start date is 2026-07-21.
5. Activate the `Subscription_Record_Page` as the org default for `Subscription__c`.
6. Open the App Launcher and confirm the **Subscription Management** app is visible
   to the assigned users.

## Verification

```bash
sf project deploy start --dry-run --source-dir force-app \
  --test-level RunSpecifiedTests --tests SubscriptionRollupServiceTest
```
