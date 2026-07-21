# SCRUM-1 — Manage customer subscriptions, automatically create them from Closed Won opportunities, and run daily renewal reminders

[Open Jira story](https://e-team-j1ppm3r8.atlassian.net/browse/SCRUM-1)

## Story Overview

| Item | Details |
| --- | --- |
| Jira story | SCRUM-1 |
| Pull request | #1 — SCRUM-1: Salesforce customer subscription lifecycle management |
| Source branch | `feature/story-001` |
| Target branch | `main` |
| Pull request status | OPEN |

## Solution Overview

The solution stores customer subscriptions in `Subscription__c`. When an Opportunity changes to Closed Won, automation creates a linked subscription and writes the new subscription ID to `Opportunity.Subscription__c`. A scheduled flow then checks active subscriptions each day, creates renewal Tasks at the configured thresholds, and updates the subscription status when it approaches expiry.

The pull request also adds validation, Account roll-ups, layouts, list views, permissions, and error logging. High-risk or high-value Case creation and renewal email notifications are not present in the supplied change.

## Technical Implementation

### Subscription data model

The `Subscription__c` object stores the customer subscription and its lifecycle information. Fields such as `Start_Date__c`, `End_Date__c`, `MRR__c`, `Status__c`, `Product__c`, `Term_Months__c`, and `Renewal_Contact__c` provide the values used by the automation.

The `Account__c` relationship connects each subscription to its Account, while `Opportunity__c` links it to the Opportunity that created it. Account roll-ups calculate active subscription revenue and count. Validation rules prevent invalid dates, non-positive revenue, and unauthorized premature status changes.

### Closed Won subscription creation

The after-save flow runs when an Opportunity enters Closed Won. It reads values such as `Product_Name__c`, `Term_Months__c`, `Amount`, `CloseDate`, and `Renewal_Type__c`, then creates an Active `Subscription__c` record linked to the Opportunity and Account. The flow updates `Opportunity.Subscription__c` with the new record ID.

If the flow fails, it creates an `Error_Log__c` record and a high-priority Task. The supplied evidence does not prove that the failure Task is routed to a Sales Ops queue.

### Daily renewal and expiry processing

The scheduled flow runs daily and evaluates subscriptions that are not Expired or Cancelled. It uses `Last_Reminder_Sent_Date__c` to avoid processing the same subscription more than once per day.

At 60, 30, and 7 days before expiry, the flow creates renewal Tasks with the configured priorities. It assigns the Task to the Account Owner and relates the Renewal Contact when one is available. At the 60-day threshold it updates `Status__c` to Expiring Soon, and after the end date it updates the subscription to Expired.

### Security and access

Subscription record visibility follows the Account relationship. Permission sets provide access for the intended user groups, and the bypass permission can exempt authorized users from selected automation and validation behavior. Account sharing still determines whether users can see subscriptions for every Account.

## Testing

StoryDoc does not execute Salesforce tests. The implementation should be verified for Closed Won creation, field mapping, validation rules, renewal thresholds, same-day deduplication, expiry updates, flow faults, and access permissions.

## Deployment Notes

- Assign the subscription permission sets to the intended users.
- Activate the subscription record page and confirm layout assignments.
- Confirm the subscription flows are active.
- Confirm the daily schedule starts at the intended time and timezone.
- Confirm the required Account, Opportunity, Contact, and subscription configuration exists before enabling the flows.

## Technical Assumptions

- Account provides the parent relationship and ownership used for subscription visibility and Task assignment.
- Opportunity provides the source values required to create a subscription.
- Renewal Contacts are available when renewal Tasks are created.
- No runtime org verification was performed by StoryDoc.
