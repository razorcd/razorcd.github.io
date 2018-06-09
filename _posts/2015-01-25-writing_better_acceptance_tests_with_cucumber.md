---
layout: post
title: Writing better acceptance tests with Cucumber
---


Acceptance tests should be very easy to follow by non tech people like our client could be.

We should only use BDD style format and only test the scenarios that bring value to the business. (ex. authentication, create resource, start/terminate an action, import some data lists, etc.). This means to not focus on "if every implemented feature of the application works" (all happy/sad paths ...) and only focus on what the client needs this application for.

Instead of doing step by step `test features` for every `scenario` we should use more general `test features` and in their `step definitions` use the helper methods to keep the code DRY. These helper methods can be defined in a separate file like `step_helpers.rb`.

## Example:

Instead of
```
Given I am a new, authenticated user
When I am on the "Partners" page
And I click "Add Partner"
And I fill in name with "John"
And I fill in city with "GB"
...
And I click "Create"
Then I should be on the "Partner" page for "John"
And I should see "Successfully created"
And I should see "John"
```
which could extend forever with every future update.

This `scenario` should look like this instead:

```
Given I am a new, authenticated user
Then I should be able to create partners
```
or 
```
Given I am a new, authenticated user
I should be able to create partners from "create partners" page if there are multiple places where partners can be created.
```

Then the `step definition` for `Then I should be able to create partners` should look like this:

```
Then(/^I should be able to create partners$/) do
  visit_partners_page
  click "Add Partner"
  expect(current_path).to be(new_partner_path)
  fill_in_partner_form_fields_with(:partner)
  click "Create partner"
  expect(current_path).to be(partner_path(1))
  expect(response).to have_content("Successfully created")
  expect(response).to have_content(partner.name)
end
```

## Tip:

Even if our client is not engaged in our acceptence tests, we might still want to write them because it also helps future new developers learn the application faster.

Next: Use Ruby helper methods to clean up `step definitions`.

Happy coding.