---
layout: post
title: Quick Ruby ERB
---

This will be a very short one, just to prove a point. ERB templates are usually very verbose while including partials and layouts and can result is a very complex UI architecture.

But as verbose as ERB code usually looks, it just comes down to a few commands:

 - `<%=`: it will execute ruby code and output the return

 - `<%` is the same as `<%-`: it will execute but not output the return

 - `<%  ...  -%>`: won't add a newline to the output

 - `<%%`: if for any reason you actually need `<%` to appear in the html

 - `<%# comment here %>` adds comments in erb style and will not convert them to html comments

That is it. This is all we need from ERB, the rest is just Ruby code and Html. Also remember that when compiling a template you can also pass a `view` object. This object will share it's scope with the template so you can call it's objects directly in erb. But still, that is just Ruby code.


Happy coding.