# conceptual-machine
just early hacking so far

"we derive CAVs by training a linear classifier between a concept’s examples and random counter examples and then taking the vector orthogonal to the decision boundary"


## screenshots
### flow
![flow](docs/docs-1.png)

### debugging log for nerds
![debugging log for nerds](docs/docs-2.png)

### these animals are cute but not very shiba...
(concept activations projected with umap, colored by concept classification)
![these animals are cute but not very shiba...](docs/docs-3.png)

### these ones are moar shiba
![these ones are moar shiba](docs/docs-4.png)


### huh, the scottish terrier concept seems weird...
![huh, the scottish terrier concept seems weird](docs/docs-a-0.png)

### how does the model do on pictures of terriers?
let's look over in [warping-machine](https://github.com/kevinrobinson/warping-machine):
![how does the model do on pictures of terriers](docs/docs-a-1.png)
![how does the model do on pictures of terriers](docs/docs-a-2.png)
![how does the model do on pictures of terriers](docs/docs-a-3.png)

### woah guess it is pretty biased
...


## datasets
### oxford pets
https://www.robots.ox.ac.uk/~vgg/data/pets/
https://www.kaggle.com/tanlikesmath/the-oxfordiiit-pet-dataset
