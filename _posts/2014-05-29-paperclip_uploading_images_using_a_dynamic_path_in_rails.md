---
layout: post
title: Uploading images using a dynamic path with Paperclip in Rails
---

Let's say we want to let our users upload images and we want to save them to our `.../public/gallery` folder using Paperclip. But we want to add them dynamically, based on another field of our model.

For example, if we have a `User` model with the field `category` (nature, vehicles, etc.) and `gallery_img` being the actual file we upload.



We want to store files like this:

   `.../public/gallery/nature/forest.jpg`

   `.../public/gallery/vehicles/jaguar.jpg`

   `.../public/gallery/vehicles/bike.jpg`

where `nature` or `vehicles` is the `current_user.category` field.



## This is how we do it:


``` ruby
class User < ActiveRecord::Base

    has_attached_file :gallery_img,
       :url => "/gallery/#{self.to_s.downcase.pluralize}/:filename",   
       :path => ":rails_root/public/gallery/#self.to_s.downcase.pluralize}/:filename"

    validates_attachment :gallery_img,
        :content_type => { :content_type => ["image/jpeg", "image/gif", "image/png"] }

end
```


`#{self.to_s.downcase.pluralize}` will set the current model lowercased and pluralised. In our case `User` will become `users`

`:url` will set the url for reading the file.   put it in view as: `current_user.gallery_img.url`

`:path` is the path where the file will be stored by Paperclip

Ensure `:url` and `:path` point to the same file!

And now:

When we have a user uploading a file e.g. `forest.jpg`, the file will be saved in `.../public/gallery/nature/forest.jpg`  and can be accessed at `localhost:3000/gallery/nature/forest.jpg`


## Notice:

Default path can be set in the evnironment files in case the models `has_attached_file` does not specify the path and url.

in  /config/environments/development.rb:
``` ruby
  Paperclip::Attachment.default_options.merge!({

    :url => "/gallery/other/:filename",

    :path => ":rails_root/public/gallery/other/:filename"

  })
```


Paperclip stores files by default in: `/system/:attachment/:id/:style/:filename`

(all symbols from the path are dynamic fields)


To also add current environment to the path use:
``` ruby
 :url => "/#{Rails.env}/gallery/other/:filename",

 :path => ":rails_root/public/#{Rails.env}/gallery/other/:filename"
```


## Tip:

put the `has_attached_file` and it's validations in a separate model concern module.


I hope this helped.

Happy coding.