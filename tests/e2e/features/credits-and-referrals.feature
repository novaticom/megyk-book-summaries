Feature: Credit System and Referrals
  As a user
  I want to manage my credits and invite friends
  So that I can use the platform and earn rewards

  Background:
    Given I am signed in

  # Credit System

  Scenario: User sees credit balance in header
    Given I am on the dashboard
    Then I should see my credit balance displayed
    And the balance should show "MC" (Megyk Credits)

  Scenario: User sees credit cost in chat
    Given I am on the library page
    When I open the chat for a book
    Then I should see the cost per message (e.g., "10 MC/message")
    And I should see my remaining messages count

  Scenario: User cannot chat without sufficient credits
    Given I have 0 credits
    And I am on the library page
    When I try to send a chat message
    Then I should see the insufficient credits modal
    And the modal should show my shortfall

  Scenario: User can view credit history
    Given I am on the profile page
    When I view my credit details
    Then I should see my lifetime credits earned
    And I should see my lifetime credits spent

  # Referral System

  Scenario: User sees referral section on profile
    Given I am on the profile page
    Then I should see the referral section
    And I should see my unique referral code
    And I should see a shareable referral link

  Scenario: User can copy referral link
    Given I am on the profile page
    When I click the copy link button
    Then the referral link should be copied to clipboard
    And I should see a "Copied" confirmation

  Scenario: User can invite friend via email
    Given I am on the profile page
    When I enter a friend's email address
    And I click send invite
    Then an invite email should be sent
    And I should see a success message

  Scenario: User cannot invite themselves
    Given I am on the profile page
    When I enter my own email address
    And I click send invite
    Then I should see an error message
    And the invite should not be sent

  Scenario: User sees referral statistics
    Given I am on the profile page
    Then I should see my total referrals count
    And I should see my successful referrals count
    And I should see credits earned from referrals

  Scenario: User understands referral rewards
    Given I am on the profile page
    Then I should see information about referral rewards
    And I should see the referrer bonus amount (1,500 MC)
    And I should see the referred user bonus amount (1,000 MC)

  # Referral Activation

  Scenario: Referred user signs up with referral code
    Given I have a referral link from a friend
    When I navigate to the signup page via the referral link
    Then I should see "Referral Applied" indication
    And the referral code should be captured

  Scenario: Referral activates on first chat message
    Given I signed up using a referral link
    And I have not activated my referral yet
    When I send my first chat message
    Then my referral should be activated
    And I should receive 1,000 MC bonus
    And my referrer should receive 1,500 MC bonus

  Scenario: Referral activates on first summary generation
    Given I signed up using a referral link
    And I have not activated my referral yet
    When I generate my first book summary
    Then my referral should be activated
    And I should receive 1,000 MC bonus
    And my referrer should receive 1,500 MC bonus

  # Integration

  Scenario: Insufficient credits modal shows invite option
    Given I have insufficient credits
    When the insufficient credits modal appears
    Then I should see an option to invite friends
    And I should be able to send an invite from the modal
    And I should see the credits I'll earn per referral
