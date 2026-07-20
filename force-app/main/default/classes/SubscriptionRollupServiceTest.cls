/**
 * Exercises the Account roll-ups maintained by SubscriptionTrigger.
 *
 * A freshly deployed custom object grants no object or field access to any
 * profile, so every test runs as a dedicated user holding the Subscription
 * Admin permission set. Creating that user in @TestSetup also keeps the user
 * DML out of the same transaction as the data DML.
 */
@IsTest
private class SubscriptionRollupServiceTest {
  private static final String TEST_USER_ALIAS = 'subrlp';

  @TestSetup
  static void createAdminUser() {
    Profile sysAdmin = [
      SELECT Id
      FROM Profile
      WHERE Name = 'System Administrator'
      LIMIT 1
    ];
    User u = new User(
      Alias = TEST_USER_ALIAS,
      Email = 'subscription.rollup@example.invalid',
      EmailEncodingKey = 'UTF-8',
      LastName = 'Rollup Tester',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = sysAdmin.Id,
      TimeZoneSidKey = 'GMT',
      Username = 'subscription.rollup.' +
        DateTime.now().getTime() +
        '@example.invalid'
    );
    insert u;

    PermissionSet ps = [
      SELECT Id
      FROM PermissionSet
      WHERE Name = 'Subscription_Admin'
      LIMIT 1
    ];
    insert new PermissionSetAssignment(
      AssigneeId = u.Id,
      PermissionSetId = ps.Id
    );
  }

  private static User testUser() {
    return [SELECT Id FROM User WHERE Alias = :TEST_USER_ALIAS LIMIT 1];
  }

  private static Subscription__c buildSubscription(
    Id accountId,
    Decimal mrr,
    String status
  ) {
    return new Subscription__c(
      Account__c = accountId,
      MRR__c = mrr,
      Status__c = status,
      Start_Date__c = Date.today(),
      End_Date__c = Date.today().addMonths(12),
      Term_Months__c = 12
    );
  }

  private static Account reload(Id accountId) {
    return [
      SELECT Total_MRR__c, Active_Subscription_Count__c
      FROM Account
      WHERE Id = :accountId
    ];
  }

  @IsTest
  static void insertSumsOnlyActiveSubscriptions() {
    System.runAs(testUser()) {
      Account acct = new Account(Name = 'Rollup Insert');
      insert acct;

      Test.startTest();
      insert new List<Subscription__c>{
        buildSubscription(acct.Id, 100, 'Active'),
        buildSubscription(acct.Id, 250, 'Active'),
        buildSubscription(acct.Id, 999, 'Cancelled')
      };
      Test.stopTest();

      Account result = reload(acct.Id);
      System.assertEquals(
        350,
        result.Total_MRR__c,
        'Only Active MRR should be summed'
      );
      System.assertEquals(
        2,
        result.Active_Subscription_Count__c,
        'Only Active records should be counted'
      );
    }
  }

  @IsTest
  static void statusChangeRemovesRecordFromRollup() {
    System.runAs(testUser()) {
      Account acct = new Account(Name = 'Rollup Status');
      insert acct;
      Subscription__c sub = buildSubscription(acct.Id, 400, 'Active');
      insert sub;

      System.assertEquals(
        400,
        reload(acct.Id).Total_MRR__c,
        'Baseline roll-up should include the active record'
      );

      Test.startTest();
      sub.Status__c = 'Cancelled';
      update sub;
      Test.stopTest();

      Account result = reload(acct.Id);
      System.assertEquals(
        0,
        result.Total_MRR__c,
        'Cancelled subscription must drop out of the total'
      );
      System.assertEquals(
        0,
        result.Active_Subscription_Count__c,
        'Cancelled subscription must drop out of the count'
      );
    }
  }

  @IsTest
  static void mrrChangeUpdatesTotal() {
    System.runAs(testUser()) {
      Account acct = new Account(Name = 'Rollup MRR');
      insert acct;
      Subscription__c sub = buildSubscription(acct.Id, 100, 'Active');
      insert sub;

      Test.startTest();
      sub.MRR__c = 175;
      update sub;
      Test.stopTest();

      System.assertEquals(
        175,
        reload(acct.Id).Total_MRR__c,
        'Total should track the new MRR'
      );
    }
  }

  @IsTest
  static void reparentUpdatesBothAccounts() {
    System.runAs(testUser()) {
      Account origin = new Account(Name = 'Rollup Origin');
      Account destination = new Account(Name = 'Rollup Destination');
      insert new List<Account>{ origin, destination };

      Subscription__c sub = buildSubscription(origin.Id, 500, 'Active');
      insert sub;

      Test.startTest();
      sub.Account__c = destination.Id;
      update sub;
      Test.stopTest();

      System.assertEquals(
        0,
        reload(origin.Id).Total_MRR__c,
        'Old parent must be cleared'
      );
      System.assertEquals(
        0,
        reload(origin.Id).Active_Subscription_Count__c,
        'Old parent count must be cleared'
      );
      System.assertEquals(
        500,
        reload(destination.Id).Total_MRR__c,
        'New parent must pick up the MRR'
      );
      System.assertEquals(
        1,
        reload(destination.Id).Active_Subscription_Count__c,
        'New parent count must be 1'
      );
    }
  }

  @IsTest
  static void deleteAndUndeleteMaintainRollup() {
    System.runAs(testUser()) {
      Account acct = new Account(Name = 'Rollup Delete');
      insert acct;
      Subscription__c sub = buildSubscription(acct.Id, 300, 'Active');
      insert sub;

      Test.startTest();
      delete sub;
      System.assertEquals(
        0,
        reload(acct.Id).Total_MRR__c,
        'Delete should clear the total'
      );

      undelete sub;
      Test.stopTest();

      Account result = reload(acct.Id);
      System.assertEquals(
        300,
        result.Total_MRR__c,
        'Undelete should restore the total'
      );
      System.assertEquals(
        1,
        result.Active_Subscription_Count__c,
        'Undelete should restore the count'
      );
    }
  }

  @IsTest
  static void bulkInsertStaysWithinGovernorLimits() {
    System.runAs(testUser()) {
      List<Account> accounts = new List<Account>();
      for (Integer i = 0; i < 50; i++) {
        accounts.add(new Account(Name = 'Bulk Account ' + i));
      }
      insert accounts;

      List<Subscription__c> subs = new List<Subscription__c>();
      for (Account acct : accounts) {
        for (Integer i = 0; i < 4; i++) {
          subs.add(buildSubscription(acct.Id, 25, 'Active'));
        }
      }

      Test.startTest();
      insert subs;
      Integer queriesUsed = Limits.getQueries();
      Test.stopTest();

      System.assert(
        queriesUsed < 20,
        'Roll-up must aggregate in bulk, used ' + queriesUsed + ' queries'
      );

      for (Account acct : [
        SELECT Total_MRR__c, Active_Subscription_Count__c
        FROM Account
        WHERE Id IN :accounts
      ]) {
        System.assertEquals(
          100,
          acct.Total_MRR__c,
          'Each account should total 4 x 25'
        );
        System.assertEquals(
          4,
          acct.Active_Subscription_Count__c,
          'Each account should count 4 subscriptions'
        );
      }
    }
  }

  @IsTest
  static void recalculateIgnoresEmptyAndNullInput() {
    System.runAs(testUser()) {
      Test.startTest();
      Integer dmlBefore = Limits.getDmlStatements();
      SubscriptionRollupService.recalculate(null);
      SubscriptionRollupService.recalculate(new Set<Id>());
      SubscriptionRollupService.recalculate(new Set<Id>{ null });
      Integer dmlAfter = Limits.getDmlStatements();
      Test.stopTest();

      System.assertEquals(
        dmlBefore,
        dmlAfter,
        'No DML should run for empty input'
      );
    }
  }
}
