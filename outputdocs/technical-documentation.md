# SCRUM-1 — Manage customer subscriptions, automatically create them from Closed Won opportunities, and automate renewal reminders, status changes, risk case creation, and notifications.

## Story Overview

- Story: SCRUM-1
- Pull request: #1 — SCRUM-1: Salesforce customer subscription lifecycle management
- Source branch: feature/story-001
- Target branch: main
- Pull request status: OPEN

## Solution Overview

The supplied diff adds the Subscription__c data model, account roll-ups, validation, permission sets, UI metadata, Closed Won subscription creation, and scheduled expiry-task automation. Material requirements are not represented for renewal email notifications or risk-case creation. The scheduled flow also uses <= threshold checks, causing reminders on every daily run within each threshold window rather than only at 60, 30, and 7 days.

## Implementation by Acceptance Criterion

### AC-1.1 — Customer Success Managers can view all active subscriptions for any Account.

#### Implemented Solution

Defines the subscription object with activities, history tracking, reporting, search, and controlled-by-parent sharing. Provides subscription manager access with Status__c read-only. Adds an all-subscriptions list view with status, dates, MRR, and expiry columns.

#### Components Changed

- force-app/main/default/objects/Subscription__c/Subscription__c.object-meta.xml
- force-app/main/default/permissionsets/Subscription_Manager.permissionset-meta.xml
- force-app/main/default/objects/Subscription__c/listViews/All_Subscriptions.listView-meta.xml

#### Technical Details

- Uses an auto-number record name with the SUB-{0000} format.
- The Account relationship is implemented as master-detail, enabling native Account roll-up summaries but also cascade deletion and inherited sharing.
- Grants subscription CRUD and read access to Account, Contact, and Error_Log__c.
- Makes Status__c and the formula field read-only through field permissions.
- Includes End_Date__c, Status__c, and Days_Until_Expiry__c columns.
- The supplied diff does not define dedicated Active, Expired, or Cancelled list views.

#### Test Source Changes

- Source scenario: CSM accesses subscriptions belonging to Accounts outside their normal record-sharing scope.
- Source scenario: filter and sort the list by Status and End Date for all required statuses.

### AC-1.2 — Each subscription displays Start Date, End Date, Monthly Recurring Revenue, current Status, and its linked Opportunity.

#### Implemented Solution

Defines the subscription object with activities, history tracking, reporting, search, and controlled-by-parent sharing. Adds an all-subscriptions list view with status, dates, MRR, and expiry columns.

#### Components Changed

- force-app/main/default/objects/Subscription__c/Subscription__c.object-meta.xml
- force-app/main/default/objects/Subscription__c/listViews/All_Subscriptions.listView-meta.xml

#### Technical Details

- Uses an auto-number record name with the SUB-{0000} format.
- The Account relationship is implemented as master-detail, enabling native Account roll-up summaries but also cascade deletion and inherited sharing.
- Includes End_Date__c, Status__c, and Days_Until_Expiry__c columns.
- The supplied diff does not define dedicated Active, Expired, or Cancelled list views.

#### Test Source Changes

- Source scenario: filter and sort the list by Status and End Date for all required statuses.

### AC-1.3 — Users can filter and sort subscriptions by End Date and Status, including Active, Expiring Soon, Expired, and Cancelled.

#### Implemented Solution

Provides subscription manager access with Status__c read-only. Adds an all-subscriptions list view with status, dates, MRR, and expiry columns.

#### Components Changed

- force-app/main/default/permissionsets/Subscription_Manager.permissionset-meta.xml
- force-app/main/default/objects/Subscription__c/listViews/All_Subscriptions.listView-meta.xml

#### Technical Details

- Grants subscription CRUD and read access to Account, Contact, and Error_Log__c.
- Makes Status__c and the formula field read-only through field permissions.
- Includes End_Date__c, Status__c, and Days_Until_Expiry__c columns.
- The supplied diff does not define dedicated Active, Expired, or Cancelled list views.

#### Test Source Changes

- Source scenario: CSM accesses subscriptions belonging to Accounts outside their normal record-sharing scope.
- Source scenario: filter and sort the list by Status and End Date for all required statuses.

### AC-1.4 — Creating a subscription automatically updates the parent Account's total MRR.

#### Implemented Solution

Defines the subscription object with activities, history tracking, reporting, search, and controlled-by-parent sharing. Adds a native SUM roll-up of active subscription MRR.

#### Components Changed

- force-app/main/default/objects/Subscription__c/Subscription__c.object-meta.xml
- force-app/main/default/objects/Account/fields/Total_MRR__c.field-meta.xml

#### Technical Details

- Uses an auto-number record name with the SUB-{0000} format.
- The Account relationship is implemented as master-detail, enabling native Account roll-up summaries but also cascade deletion and inherited sharing.
- Filters Subscription__c records where Status__c equals Active.
- Summarizes Subscription__c.MRR__c through Subscription__c.Account__c.

#### Test Source Changes

- None identified.

### AC-1.5 — Validation prevents invalid subscription data, including an End Date before the Start Date.

#### Implemented Solution

Prevents an End Date earlier than the Start Date. Provides administrative subscription and error-log access, including editable Status__c.

#### Components Changed

- force-app/main/default/objects/Subscription__c/validationRules/End_Date_After_Start_Date.validationRule-meta.xml
- force-app/main/default/permissionsets/Subscription_Admin.permissionset-meta.xml

#### Technical Details

- Validates both dates when populated.
- Displays the error on End_Date__c.
- Grants full subscription CRUD and Status__c edit access.
- Grants full Error_Log__c access.

#### Test Source Changes

- Source scenario: create or update a subscription with End_Date__c earlier than Start_Date__c.

### AC-2.1 — When an Opportunity changes to Closed Won, a corresponding Subscription is automatically created and linked to both the Opportunity and its Account.

#### Implemented Solution

Creates a subscription when an Opportunity transitions into Closed Won and writes the new subscription reference back to the Opportunity.

#### Components Changed

- force-app/main/default/flows/Create_Subscription_On_Closed_Won.flow-meta.xml

#### Technical Details

- Runs after save on Opportunity when StageName changes to Closed Won.
- Maps Account, Opportunity, product, term, renewal type, start date, derived end date, derived MRR, and Active status.
- Supports New Business, Renewal, and Upsell through Opportunity.Renewal_Type__c.
- Includes fault paths that create Error_Log__c records and a high-priority Task.

#### Test Source Changes

- Source scenario: transition New Business, Renewal, and Upsell Opportunities to Closed Won.
- Source scenario: force subscription or Opportunity update failure and verify logging plus task creation.
- Source scenario: save a Closed Won Opportunity as a bypass-authorized user.

### AC-2.2 — The created Subscription automatically receives product, term, MRR, and start and end date details from the Opportunity.

#### Implemented Solution

Creates a subscription when an Opportunity transitions into Closed Won and writes the new subscription reference back to the Opportunity.

#### Components Changed

- force-app/main/default/flows/Create_Subscription_On_Closed_Won.flow-meta.xml

#### Technical Details

- Runs after save on Opportunity when StageName changes to Closed Won.
- Maps Account, Opportunity, product, term, renewal type, start date, derived end date, derived MRR, and Active status.
- Supports New Business, Renewal, and Upsell through Opportunity.Renewal_Type__c.
- Includes fault paths that create Error_Log__c records and a high-priority Task.

#### Test Source Changes

- Source scenario: transition New Business, Renewal, and Upsell Opportunities to Closed Won.
- Source scenario: force subscription or Opportunity update failure and verify logging plus task creation.
- Source scenario: save a Closed Won Opportunity as a bypass-authorized user.

### AC-2.3 — The Opportunity provides a clear link to its newly created Subscription.

#### Implemented Solution

Creates a subscription when an Opportunity transitions into Closed Won and writes the new subscription reference back to the Opportunity. Adds Opportunity subscription source fields and the reverse Subscription__c link to a new layout.

#### Components Changed

- force-app/main/default/flows/Create_Subscription_On_Closed_Won.flow-meta.xml
- force-app/main/default/layouts/Opportunity-Opportunity Subscription Layout.layout-meta.xml

#### Technical Details

- Runs after save on Opportunity when StageName changes to Closed Won.
- Maps Account, Opportunity, product, term, renewal type, start date, derived end date, derived MRR, and Active status.
- Supports New Business, Renewal, and Upsell through Opportunity.Renewal_Type__c.
- Includes fault paths that create Error_Log__c records and a high-priority Task.
- Displays term, product, renewal type, and read-only Subscription__c.
- Adds the Subscription__c.Opportunity__c related list.

#### Test Source Changes

- Source scenario: transition New Business, Renewal, and Upsell Opportunities to Closed Won.
- Source scenario: force subscription or Opportunity update failure and verify logging plus task creation.
- Source scenario: save a Closed Won Opportunity as a bypass-authorized user.

### AC-2.4 — Automatic subscription creation supports New Business, Renewal, and Upsell Opportunities.

#### Implemented Solution

Creates a subscription when an Opportunity transitions into Closed Won and writes the new subscription reference back to the Opportunity. Adds Opportunity subscription source fields and the reverse Subscription__c link to a new layout.

#### Components Changed

- force-app/main/default/flows/Create_Subscription_On_Closed_Won.flow-meta.xml
- force-app/main/default/layouts/Opportunity-Opportunity Subscription Layout.layout-meta.xml

#### Technical Details

- Runs after save on Opportunity when StageName changes to Closed Won.
- Maps Account, Opportunity, product, term, renewal type, start date, derived end date, derived MRR, and Active status.
- Supports New Business, Renewal, and Upsell through Opportunity.Renewal_Type__c.
- Includes fault paths that create Error_Log__c records and a high-priority Task.
- Displays term, product, renewal type, and read-only Subscription__c.
- Adds the Subscription__c.Opportunity__c related list.

#### Test Source Changes

- Source scenario: transition New Business, Renewal, and Upsell Opportunities to Closed Won.
- Source scenario: force subscription or Opportunity update failure and verify logging plus task creation.
- Source scenario: save a Closed Won Opportunity as a bypass-authorized user.

### AC-2.5 — Subscription auto-creation failures are logged and Sales Ops is notified.

#### Implemented Solution

Creates a subscription when an Opportunity transitions into Closed Won and writes the new subscription reference back to the Opportunity. Provides administrative subscription and error-log access, including editable Status__c.

#### Components Changed

- force-app/main/default/flows/Create_Subscription_On_Closed_Won.flow-meta.xml
- force-app/main/default/permissionsets/Subscription_Admin.permissionset-meta.xml

#### Technical Details

- Runs after save on Opportunity when StageName changes to Closed Won.
- Maps Account, Opportunity, product, term, renewal type, start date, derived end date, derived MRR, and Active status.
- Supports New Business, Renewal, and Upsell through Opportunity.Renewal_Type__c.
- Includes fault paths that create Error_Log__c records and a high-priority Task.
- Grants full subscription CRUD and Status__c edit access.
- Grants full Error_Log__c access.

#### Test Source Changes

- Source scenario: transition New Business, Renewal, and Upsell Opportunities to Closed Won.
- Source scenario: force subscription or Opportunity update failure and verify logging plus task creation.
- Source scenario: save a Closed Won Opportunity as a bypass-authorized user.

### AC-3.1 — At 60, 30, and 7 days before a subscription ends, the Account Owner and designated Renewal Contact receive a Task.

#### Implemented Solution

Adds a daily scheduled flow for expiry status changes and renewal tasks. Adds the Urgent Task priority used by the 7-day renewal branch.

#### Components Changed

- force-app/main/default/flows/Daily_Subscription_Expiry_Check.flow-meta.xml
- force-app/main/default/standardValueSets/TaskPriority.standardValueSet-meta.xml

#### Technical Details

- Configured as a daily scheduled flow at 06:00 with Active/Expiring Soon-equivalent entry filters.
- Uses Last_Reminder_Sent_Date__c to prevent duplicate processing on the same calendar day.
- Creates Account Owner-owned tasks with the subscription as WhatId and Renewal Contact as WhoId.
- Updates status to Expired on or after the end date and to Expiring Soon in the <=60-day branch.
- The <=7, <=30, and <=60 conditions are evaluated daily, so records can receive repeated tasks on successive days within a window.
- There is no email action, email alert, email template reference, renewal-contact-owned task, Case creation, or queue-routing action.
- Retains High, Normal, and Low values in the supplied value set.
- The daily flow assigns Urgent to the <=7-day branch.

#### Test Source Changes

- Source scenario: run records at exactly 60, 30, and 7 days before expiry.
- Source scenario: run the flow on consecutive days for a subscription within each threshold window and inspect task counts.
- Source scenario: use a high-MRR subscription and a high-risk Account to verify Case creation and queue assignment.
- Source scenario: verify Account Owner and Renewal Contact task recipients and email delivery.

### AC-3.2 — For high-risk or high-value subscriptions, a Case is automatically created and assigned to the appropriate Service or Customer Success queue.

#### Implemented Solution

Adds a daily scheduled flow for expiry status changes and renewal tasks. Adds a lookup from Case to Subscription__c, but does not implement risk-case creation or queue routing.

#### Components Changed

- force-app/main/default/flows/Daily_Subscription_Expiry_Check.flow-meta.xml
- force-app/main/default/objects/Case/fields/Subscription__c.field-meta.xml

#### Technical Details

- Configured as a daily scheduled flow at 06:00 with Active/Expiring Soon-equivalent entry filters.
- Uses Last_Reminder_Sent_Date__c to prevent duplicate processing on the same calendar day.
- Creates Account Owner-owned tasks with the subscription as WhatId and Renewal Contact as WhoId.
- Updates status to Expired on or after the end date and to Expiring Soon in the <=60-day branch.
- The <=7, <=30, and <=60 conditions are evaluated daily, so records can receive repeated tasks on successive days within a window.
- There is no email action, email alert, email template reference, renewal-contact-owned task, Case creation, or queue-routing action.
- Supports associating a Case with a subscription and displaying a related list.
- No changed file defines the after-save Subscription flow, high-MRR/high-risk criteria, or Renewal_Queue_Assignment__mdt routing.

#### Test Source Changes

- Source scenario: run records at exactly 60, 30, and 7 days before expiry.
- Source scenario: run the flow on consecutive days for a subscription within each threshold window and inspect task counts.
- Source scenario: use a high-MRR subscription and a high-risk Account to verify Case creation and queue assignment.
- Source scenario: verify Account Owner and Renewal Contact task recipients and email delivery.
- Source scenario: high-risk Account and MRR >= 5000 subscription reaches Expiring Soon.

### AC-3.3 — A subscription status changes to Expiring Soon at the appropriate renewal threshold.

#### Implemented Solution

Adds a daily scheduled flow for expiry status changes and renewal tasks.

#### Components Changed

- force-app/main/default/flows/Daily_Subscription_Expiry_Check.flow-meta.xml

#### Technical Details

- Configured as a daily scheduled flow at 06:00 with Active/Expiring Soon-equivalent entry filters.
- Uses Last_Reminder_Sent_Date__c to prevent duplicate processing on the same calendar day.
- Creates Account Owner-owned tasks with the subscription as WhatId and Renewal Contact as WhoId.
- Updates status to Expired on or after the end date and to Expiring Soon in the <=60-day branch.
- The <=7, <=30, and <=60 conditions are evaluated daily, so records can receive repeated tasks on successive days within a window.
- There is no email action, email alert, email template reference, renewal-contact-owned task, Case creation, or queue-routing action.

#### Test Source Changes

- Source scenario: run records at exactly 60, 30, and 7 days before expiry.
- Source scenario: run the flow on consecutive days for a subscription within each threshold window and inspect task counts.
- Source scenario: use a high-MRR subscription and a high-risk Account to verify Case creation and queue assignment.
- Source scenario: verify Account Owner and Renewal Contact task recipients and email delivery.

### AC-3.4 — Recipients receive an email notification in addition to the renewal Task.

#### Implemented Solution

Adds a daily scheduled flow for expiry status changes and renewal tasks.

#### Components Changed

- force-app/main/default/flows/Daily_Subscription_Expiry_Check.flow-meta.xml

#### Technical Details

- Configured as a daily scheduled flow at 06:00 with Active/Expiring Soon-equivalent entry filters.
- Uses Last_Reminder_Sent_Date__c to prevent duplicate processing on the same calendar day.
- Creates Account Owner-owned tasks with the subscription as WhatId and Renewal Contact as WhoId.
- Updates status to Expired on or after the end date and to Expiring Soon in the <=60-day branch.
- The <=7, <=30, and <=60 conditions are evaluated daily, so records can receive repeated tasks on successive days within a window.
- There is no email action, email alert, email template reference, renewal-contact-owned task, Case creation, or queue-routing action.

#### Test Source Changes

- Source scenario: run records at exactly 60, 30, and 7 days before expiry.
- Source scenario: run the flow on consecutive days for a subscription within each threshold window and inspect task counts.
- Source scenario: use a high-MRR subscription and a high-risk Account to verify Case creation and queue assignment.
- Source scenario: verify Account Owner and Renewal Contact task recipients and email delivery.

### AC-3.5 — Renewal automation runs daily without manual intervention.

#### Implemented Solution

Adds a daily scheduled flow for expiry status changes and renewal tasks.

#### Components Changed

- force-app/main/default/flows/Daily_Subscription_Expiry_Check.flow-meta.xml

#### Technical Details

- Configured as a daily scheduled flow at 06:00 with Active/Expiring Soon-equivalent entry filters.
- Uses Last_Reminder_Sent_Date__c to prevent duplicate processing on the same calendar day.
- Creates Account Owner-owned tasks with the subscription as WhatId and Renewal Contact as WhoId.
- Updates status to Expired on or after the end date and to Expiring Soon in the <=60-day branch.
- The <=7, <=30, and <=60 conditions are evaluated daily, so records can receive repeated tasks on successive days within a window.
- There is no email action, email alert, email template reference, renewal-contact-owned task, Case creation, or queue-routing action.

#### Test Source Changes

- Source scenario: run records at exactly 60, 30, and 7 days before expiry.
- Source scenario: run the flow on consecutive days for a subscription within each threshold window and inspect task counts.
- Source scenario: use a high-MRR subscription and a high-risk Account to verify Case creation and queue assignment.
- Source scenario: verify Account Owner and Renewal Contact task recipients and email delivery.

## Salesforce Components Changed

- force-app/main/default/objects/Subscription__c/Subscription__c.object-meta.xml — SalesforceObjectConfiguration (changed)
- force-app/main/default/objects/Account/fields/Total_MRR__c.field-meta.xml — SalesforceObjectConfiguration (changed)
- force-app/main/default/objects/Subscription__c/validationRules/End_Date_After_Start_Date.validationRule-meta.xml — SalesforceObjectConfiguration (changed)
- force-app/main/default/flows/Create_Subscription_On_Closed_Won.flow-meta.xml — Flow (changed)
- force-app/main/default/flows/Daily_Subscription_Expiry_Check.flow-meta.xml — Flow (changed)
- force-app/main/default/objects/Case/fields/Subscription__c.field-meta.xml — SalesforceObjectConfiguration (changed)
- force-app/main/default/permissionsets/Subscription_Manager.permissionset-meta.xml — PermissionSet (changed)
- force-app/main/default/permissionsets/Subscription_Admin.permissionset-meta.xml — PermissionSet (changed)
- force-app/main/default/standardValueSets/TaskPriority.standardValueSet-meta.xml — OtherSalesforceMetadata (changed)
- force-app/main/default/customPermissions/Bypass_Subscription_Flow.customPermission-meta.xml — OtherSalesforceMetadata (changed)
- force-app/main/default/layouts/Opportunity-Opportunity Subscription Layout.layout-meta.xml — Layout (changed)
- force-app/main/default/objects/Subscription__c/listViews/All_Subscriptions.listView-meta.xml — SalesforceObjectConfiguration (changed)

## Supporting Changes

- No supplied changed file defines the Lightning email template, email alerts, recipient configuration, or Org-Wide Email Address required by AC-3.4 and DD-17.
- No supplied changed file defines Subscription after-save Case creation or Renewal_Queue_Assignment__mdt routing required by AC-3.2, DD-15, and DD-16.
- The daily flow's same-day deduplication prevents same-day repeats but does not record which threshold was processed; its <= conditions therefore permit repeated daily reminders before expiry.
- The supplied permission sets do not grant View All access, so universal CSM visibility across any Account is dependent on pre-existing Account sharing configuration.
- The documentation claims deployment and org verification, but those claims are unverified within this read-only StoryDoc analysis.

## Security and Access Changes

- Subscription_Manager and Subscription_Viewer restrict Status__c editing through field-level security; Subscription_Admin permits it.
- Subscription_Automation_Bypass grants a permission that suppresses Closed Won subscription creation and exempts the premature-expiry validation rule.
- Master-detail sharing makes subscription visibility follow Account sharing and causes Account deletion to cascade to subscriptions.

## Dependencies

- Existing Opportunity fields such as Amount, AccountId, CloseDate, Product_Name__c, Term_Months__c, and Renewal_Type__c.
- Existing Account Owner and Renewal Contact data with valid task/email eligibility.
- Salesforce Task, OpportunityLineItem, Account, Contact, and Case capabilities.
- Sales Ops ownership/notification configuration is not established by the supplied diff.
- Customer Success or Service queue configuration and renewal routing metadata are not established by the supplied diff.
- Email template, email alert, and Org-Wide Email Address configuration are not established by the supplied diff.

## Testing

- Closed Won transition creates and links a subscription for New Business, Renewal, and Upsell.
- Subscription validation rejects an End Date before Start Date and non-positive MRR.
- Account roll-ups include only Active subscriptions.
- Renewal processing occurs at exactly 60, 30, and 7 days without daily-window duplicates.
- Renewal tasks are delivered to both the Account Owner and Renewal Contact.
- High-risk or high-value Expiring Soon subscriptions create and route Cases.
- Renewal emails are sent with the required recipients and sender.
- Bypass permission suppresses automatic creation.

Test execution status: Tests were not executed by StoryDoc.

## Deployment Notes

- The supplied documentation lists post-deployment permission-set assignment, layout assignment, record-page activation, schedule confirmation, and app visibility confirmation.
- No deployment, activation, or org configuration was independently verified in this analysis.

## Assumptions

- An Opportunity Subscription__c lookup field will be created to provide the reverse link from Opportunity to Subscription.
- Opportunity fields or logic required to source product, term, MRR, start date, and end date will be available.
- Account risk, region, and tier attributes required for case-routing logic are available.
- A Customer Success – General queue exists or will be configured.
- Sales Ops queue assignment and the selected error logging mechanism will be configured.
- Account Owner and Renewal Contact have valid email addresses and are eligible to receive email alerts.
- The analysis is limited to the untrusted story, pull-request metadata, changed-file list, and supplied diff.
- No local repository inspection, test execution, deployment, or acceptance-criterion status assignment was performed.
