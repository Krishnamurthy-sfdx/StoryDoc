/**
 * Keeps the Account subscription roll-ups in step with Subscription__c changes.
 */
trigger SubscriptionTrigger on Subscription__c(
  after insert,
  after update,
  after delete,
  after undelete
) {
  List<Subscription__c> newList = Trigger.isDelete ? null : Trigger.new;
  Map<Id, Subscription__c> oldMap = Trigger.isInsert || Trigger.isUndelete
    ? null
    : Trigger.oldMap;

  SubscriptionRollupService.recalculate(
    SubscriptionRollupService.affectedAccountIds(newList, oldMap)
  );
}
