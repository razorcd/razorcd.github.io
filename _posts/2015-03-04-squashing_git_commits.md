---
layout: post
title: Squashing commits with git and keeping your branches clean
---

Lets face it, it happens often that our branches are flooded with commits with a significat number of them not even being directly related to the feature we are implementing, like `fixing typo` or `cleanup debugger, comments`, etc.

When we have too many commits on our branch, it is a very good idea to reduce the number of commits it has to just a few. Using Git we can do that by sqaushing them. By having only 1..3 commits per branch it will keep the git tree cleaner and any rebasing will reduce the number of conflucts we might encounter.



Lets see how is this done. Let's consider that we have the following commits in our `filters` branch:


```
5e718ce (HEAD, filters) partiall implemented orphans filters

* e98ba93 refactor model so it can respond to new_record?

* c480bbf admin_users index passing

* 649b014 added test for admin_users index

* cfd5200 add request fulfilled filter to sponsors

* 6bc16fa fix typo

* 2908231 filters down to 'start date'

* 063db39 add created at date filter to sponsors

* 05c9c1a filters down to 'City'

* 14b97eb country filter added

* 2830712 filters down to 'agent'

* eaf1e0c added branch filter to sponsor

* aed521d remove default filters so only gender passes

* be2eff3 sponsor filter tests

* 872b96c remove default filters from partners, add default scope
```

If you do a `rebase` to move this `filters` branch on the top of another branch and your conflicts escalade on every commit you will end up growing white hair until you fix them all. 

So lets merge them in 3 commits by doing the following:


`git rebase -i HEAD~15` where `-i` means interactive and `~15` means the number of commits to count from the `HEAD` down. (I said on HEAD so it means it is the current branch that is operating on)

Nothing is changed yet. Your default editor will start and open a new file with all commits you coosed (15 in out case).

It looks like this now:

```
pick 872b96c remove default filters from partners, add default scope

pick be2eff3 sponsor filter tests

pick aed521d remove default filters so only gender passes

pick eaf1e0c added branch filter to sponsor

pick 2830712 filters down to 'agent'

pick 14b97eb country filter added

pick 05c9c1a filters down to 'City'

pick 063db39 add created at date filter to sponsors

pick 2908231 filters down to 'start date'

pick 6bc16fa fix typo

pick cfd5200 add request fulfilled filter to sponsors

pick 649b014 added test for admin_users index

pick c480bbf admin_users index passing

pick e98ba93 refactor model so it can respond to new_record?

pick 5e718ce partiall implemented orphans filters
```

You can see the same 15 commits but this time they are in reversed order. The bottom one is the recent one, where the HEAD is.

Here we can select which ones we want to squash by changing the `pick` in front of the commit into `squash` (or `s`). The commit that is marked `squash` will be included in the commit that is above it.

So `squash 5e718ce partiall implemented orphans filters` will be included in `pick e98ba93 refactor model so it can respond to new_record?` and so on. Multiple commits can be squashed into same base commit.

By using `squash` it will ask us on each action what is the new message we want on the new squashed commit.

By using `fixup` instead of `squash` it will do the same squashing action but it will not ask if we want to change the commit message, it will keep the commit message the base commit already has.



The commands that can be used in the interactive rebase view are:

```
#  p, pick = use commit

#  r, reword = use commit, but edit the commit message

#  e, edit = use commit, but stop for amending (performing changes on it)

#  s, squash = use commit, but meld into previous commit

#  f, fixup = like "squash", but discard this commit's log message

#  x, exec = run command (the rest of the line) using shell
```


After making the changes in the interactive rebase view this is what we have:

```
pick 872b96c remove default filters from partners, add default scope

fixup be2eff3 sponsor filter tests

fixup aed521d remove default filters so only gender passes

fixup eaf1e0c added branch filter to sponsor

fixup 2830712 filters down to 'agent'

fixup 14b97eb country filter added

fixup 05c9c1a filters down to 'City'

fixup 063db39 add created at date filter to sponsors

fixup 2908231 filters down to 'start date'

fixup 6bc16fa fix typo

fixup cfd5200 add request fulfilled filter to sponsors

fixup 649b014 added test for admin_users index

fixup c480bbf admin_users index passing

pick e98ba93 refactor model so it can respond to new_record?

squash 5e718ce partiall implemented orphans filters
```

Next save and exit the editor.


It will process the squashing and by opening the editor again it will ask us for the commit message on the commit `pick e98ba93 refactor model so it can respond to new_record?`.

Next we add the new commit message, save and exit.

Here is our new `filters` branch:

```
* c941fda (HEAD, filters) refactor model so it can respond to new_record. partiall implemented

* 6862fce remove default filters from partners, add default scope
```


And that's it, 2 commits look much better.


### Tip:

Remember that if you make some changes to your code and you want to merge these changes in the last commit without creating a new commit and then squshing it, you can just do:

```
git add .
git commit --amend
```

This will just merge the staging changes into the last existing commit. It is very good to keep commits clean and not pollute the branch with irelevant commits like "fixing typo".


I hope this helped.

Happy coding.