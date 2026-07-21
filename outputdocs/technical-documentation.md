# SCRUM-1 — Manage customer subscriptions, automatically create them from Closed Won opportunities, and run daily renewal reminders

[Open Jira story](https://e-team-j1ppm3r8.atlassian.net/browse/SCRUM-1)

### Contents

- [Story Overview](#story-overview)
- [Solution Overview](#solution-overview)
- [Technical Implementation](#technical-implementation)
- [Supporting Changes](#supporting-changes)
- [Security and Access](#security-and-access)
- [Dependencies](#dependencies)
- [Deployment Notes](#deployment-notes)
- [Technical Assumptions](#technical-assumptions)

### Story Overview

| Item | Details |
| --- | --- |
| Jira story | `SCRUM-1` |
| Pull request | `#1` — SCRUM-1: Salesforce customer subscription lifecycle management |
| Source branch | `feature/story-001` |
| Target branch | `main` |
| Pull request status | OPEN |

### Solution Overview

The solution stores customer subscriptions in `Subscription__c`. When an Opportunity changes to Closed Won, automation creates a linked subscription and writes the new subscription ID to `Opportunity.Subscription__c`. A scheduled flow then checks active subscriptions each day, creates renewal Tasks at the configured thresholds, and updates the subscription status when it approaches expiry.

The pull request also adds validation, Account roll-ups, layouts, list views, permissions, and error logging. High-risk or high-value Case creation and renewal email notifications are not present in the supplied change.

### Technical Implementation

This section explains what was implemented and how the changed Salesforce metadata supports the solution.

#### Data Model

| Metadata | Salesforce type | Purpose | Change |
| --- | --- | --- | --- |
| `Subscription__c` | `Custom Object` | Stores the customer subscription and its lifecycle information. | Added |
| `Subscription__c.Account__c` | `Custom Field` | Links the subscription to its Account for visibility and roll-up calculations. | Added |
| `Subscription__c.Start_Date__c` | `Custom Field` | Stores when the subscription starts. | Added |
| `Subscription__c.End_Date__c` | `Custom Field` | Stores when the subscription expires. | Added |
| `Subscription__c.MRR__c` | `Custom Field` | Stores monthly recurring revenue. | Added |
| `Subscription__c.Status__c` | `Custom Field` | Stores the subscription lifecycle status. | Added |
| `Subscription__c.Renewal_Contact__c` | `Custom Field` | Identifies the contact used for renewal follow-up. | Added |

#### `Create_Subscription_On_Closed_Won`

**Salesforce type:** `Flow`

**Change:** Modified

The record-triggered flow creates a subscription when an Opportunity enters Closed Won. It maps the Opportunity values to the new `Subscription__c` record, links the record to the Account and Opportunity, and writes the new subscription ID back to `Opportunity.Subscription__c`.

**Flow logic**

| Step | Implementation |
| --- | --- |
| Type | Record-Triggered Flow |
| Object | `Opportunity` |
| Trigger | After Save |
| Entry conditions | `StageName` equals Closed Won and the prior value was not Closed Won. This prevents the flow from running again on later edits. |
| Decision | Check whether the Opportunity is New Business, Renewal, or Upsell. |
| Field mapping | Populate `Account__c`, `Opportunity__c`, `Start_Date__c`, `End_Date__c`, `MRR__c`, `Product__c`, `Term_Months__c`, `Status__c`, and `Renewal_Type__c`. |
| Create record | Insert the new `Subscription__c` record. |
| Update record | Write the new subscription ID to `Opportunity.Subscription__c`. |
| Error handling | Use a fault path to create an `Error_Log__c` record and a failure Task. The supplied change does not prove that the Task is routed to a Sales Ops queue. |

#### `Daily_Subscription_Expiry_Check`

**Salesforce type:** `Flow`

**Change:** Modified

The scheduled flow runs daily and evaluates subscriptions that are not Expired or Cancelled. It prevents duplicate daily processing with `Last_Reminder_Sent_Date__c`, creates renewal Tasks, and updates the subscription status as the expiry date approaches.

**Flow logic**

| Step | Implementation |
| --- | --- |
| Type | Scheduled Flow |
| Schedule | Runs daily at the configured start time. |
| Record selection | Select subscriptions with an end date that are not Expired or Cancelled. |
| Reminder thresholds | Create renewal Tasks at 60, 30, and 7 days before expiry. |
| Task assignment | Assign the Task to the Account Owner and relate the Renewal Contact when present. |
| Status update | Set `Status__c` to Expiring Soon at the 60-day threshold and Expired on or after the end date. |
| Duplicate prevention | Skip records already processed today using `Last_Reminder_Sent_Date__c`. |

### Supporting Changes

- Account roll-ups calculate active subscription revenue and count.
- Layouts, list views, tabs, and the subscription application support day-to-day user access.
- Validation rules prevent invalid dates, non-positive revenue, and unauthorized premature status changes.

### Security and Access

| Component | Security change |
| --- | --- |
| `Subscription_Manager` permission set | Provides the intended manager access to subscription records and fields. |
| `Subscription_Viewer` permission set | Provides read-only access to subscription records and selected fields. |
| `Subscription_Admin` permission set | Provides administrative access to subscription configuration. |
| `Bypass_Subscription_Flow` custom permission | Allows authorized administrators or migration users to bypass subscription creation logic. |
| `Subscription__c.Status__c` | Field access differs by permission set so viewer users cannot edit the lifecycle status. |

Subscription record visibility follows the Account relationship. Users still need access to the parent Account to see its subscriptions.

### Dependencies

- The Opportunity must provide the values required to create a subscription.
- Account ownership is required for renewal Task assignment.
- Renewal Contacts must be available when renewal Tasks are created.
- The scheduled flow requires the subscription end date and daily-processing date fields.

### Deployment Notes

- Assign the subscription permission sets to the intended users.
- Activate the subscription record page and confirm layout assignments.
- Confirm the subscription flows are active.
- Confirm the daily schedule starts at the intended time and timezone.
- Confirm the required Account, Opportunity, Contact, and subscription configuration exists before enabling the flows.

### Technical Assumptions

- Account provides the parent relationship and ownership used for subscription visibility and Task assignment.
- Opportunity provides the source values required to create a subscription.
- Renewal Contacts are available when renewal Tasks are created.
- No runtime org verification was performed by StoryDoc.
