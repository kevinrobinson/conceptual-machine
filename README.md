



# Add indicator for retraining model when training data changes
If change the class name, or remove images from the training set, the "Update my cloud model" is disabled when I got to export.  This makes sense, since the model has changed.

But in that case, there's no way to know in the UI that the "training" and "preview" sections don't reflect what's in the training data UI.  To address, maybe add a visual indication in the model section that the models needs to be retrained to reflect those changes?



# Small UI tweaks


# Inform developers when model has low per-class accuracy on test set




# Wait for user intent to require camera permissions
When training an image model, the way that users know training is done is that the browser asks for permissions to use the camera.  If this is the first time, there's no indication as to why this is happening.


The helpful popup for looking at the "Preview" section that pops up at the same time hides the "webcam" option altogether.

One way to address could be defaulting the webcam to "off".  In that case, the helpful popup is the thing that draws your attention when done, and the UI there can make it clear that users can choose between clicking to turn on the webcam, or uploading files.

Relatedly, turning the webcam on without user intent gets in the way when working with images files.



# Ask for camera permissions each time (ignore)
When training a model on images, I mistakenly clicked on the "Webcam" button and then denied permissions.

After training, the "preview" panel showed an error about the webcam.




# What is the token when publishing, and what is userMetadata?
