# AnkiDeckGenerator

Convert a list of Chinese characters/words/sentences and/or English words/sentences into an extremely powerful Anki Deck Package (apkg).
Note: This project is still in its beta phase at the moment.

# Screenshots
![gif-video](screenshots/screen-recording.gif)

## TODO
- [x] Make some changes to pepebecker's pinyin-split project so we can use it in the templates to properly split multi-syllable hanzi words.
- [x] Transpile or translate pinyin-split to ES5 and add it to the templates
- [ ] Rewrite template code in proper ES2018 and implement webpack to bundle and transpile it
- [ ] Rewrite templates using React (create a feature branch first)
- [ ] Consider adding babel to the project to make it compatible with node versions < 10 and to be able to ditch require() for import/export
- [x] Create a Stroke order diagram generator that outputs still images with numbers
- [x] and create a Pull Request at https://github.com/skishore/makemeahanzi adding this generator script and the generated stroke diagrams
- [ ] Create another Pull Request for makemeahanzi with the latest generator script changes.
- [ ] Make popup work on Windows
- [x] Make popup work on Linux
- [x] Make popup work on Android
- [ ] Consider moving away from bootstrap 3
- [x] Accept individual Chinese characters as input
- [x] Accept Chinese words consisting of multiple characters as input
- [x] Accept Chinese sentences consisting of multiple character as input
- [x] Create a highly dynamic and configurable input file format
- [x] Generate Anki card data for the Hanzi
- [x] Generate Anki card data for the English translation
- [x] Generate Anki card data for example words that contain a given cards Hanzi
- [x] Generate Anki card data for the english translation of the example words
- [x] Generate Anki card data for example sentences that contain a given cards Hanzi
- [x] Generate Anki card data for the english translation of the example sentences
- [x] Add multiple audio files for the pronunciation of the used Hanzi for every context
- [x] Generate Anki card data for the Pinyin
- [x] Generate Anki card data for the Hanzi decomposition
- [x] Generate Anki card data for the Hanzi type (ideographic/pictographic/pictophonetic)
- [x] Generate Anki card data for the Hanzi formation in case of ideographic/pictographic
- [x] Generate Anki card data for the semantic/phonetic Hanzi etymology in case of pictophonetic
- [x] Generate Anki card data for the primary radical of the Hanzi
- [x] Generate Anki card data for the charCode as used in JavaScript
- [x] Generate Anki card data for the charCode as used in JavaScript
- [x] Copy the Hanzi stroke order diagrams into the deck output
- [x] Write a bootstrap based Anki card template that uses all the features mentioned above
- [x] Allow specifiying an output dir for the generated files
- [x] Reverse engineer the API of archchinese.com (done, for the most part)
- [x] Reverse engineer the audio download API of forvo.com (done, for the most part)
- [ ] Reverse engineer the audio requesting API of forvo.com
- [ ] Add a flag to automatically request native speaker recordings for your input file (will require a forvo.com account)
- [x] Separate the code properly (Create dedicated classes for apkg management, forvo.com, archchinese.com, mdbg.net and MakeMeAHanzi)
- [x] Move more code out of the index.js before it explodes
- [x] Reverse engineer the apkg format, especially it's sqlite db structure
- [x] Add screenshots
- [ ] Fill missing data (hanzi, pinyin, audio) when only specifying English words/sentences as input
- [ ] Document all features
- [ ] Clean up for initial release

## Requirements
- git
- nodejs (at least v10)

## Installation
```
git clone --recursive https://github.com/FOSS-Chinese/AnkiDeckGenerator.git
cd AnkiDeckGenerator
npm i
cd submodules/makemeahanzi/stroke_caps
node generateStillSvgs.js
```

## Example Usage
Create an input file. (Take the [example-input.txt](example-input.txt) as an example.)
Then run the following command:
```
node index.js auto-generate -i example-input.txt -n ExampleDeck -d MyDeckDescription ExampleDeck.apkg
```
Or just run `npm run example`.

## Input file options:
Options start with `#!`. Comments start with only a `#`.
Comments can be anywhere in the file and the deck option can be used multiple times to create more than 1 subdeck.
```
#! version = 1 # Is always 1 for now
#! use-online-services = true # Not implemented yet
#! leave-blank-sequence = {SKIP_LOOKPUP} # can be used to skip media downloads etc
#! separator = | # sepatator for vocab input and for the format:
#! format = simplified|traditional|pinyin|english|audio # format which has to be used for the input vocab (you can leave everything empty, but simplified)
#! value-separator = ; # Use as a separator when there are multiple definitions or pinyins

#! deck = CurrentDeckName # Change the deckname for the following input vocab (can be used as many times as you want)
```

## Usage
(Note: Some of these options have not been tested yet.)
```
  Usage: node ./index.js auto-generate [options] <apkg-output-file>

  Options:

    -i, --input-file [file-path]                             File containing a json-array of Chinese characters, words and/or sentences.
    -c, --clear-apkg-temp [boolean]                          Automatically clear the apkg temp folder after creating the apkg. Default: true
    -n, --deck-name <string>                                 Name of the deck to be created
    -d, --deck-description <string>                          Description of the deck to be created
    -t, --temp-folder [folder-path]                          Folder to be used/created for temporary files
    -l, --libs-folder [folder-path]                          Folder holding libraries for template
    -a, --audio-recordings-limit [integer]                   Max amount of audio recordings to download for each character, word and sentence. (-1: all, 0: none, 1: one, 2: two) Default: 1
    -r, --big-dict [boolean]                                 Include all hanzi chars in the deck-internal dictionary. (Use only if you want to add cards later on without the generator.) Default: false
    -r, --recursive-media [boolean]                          Download media not only for input file entries, but also for every single word, character and component found in each entry. Default: true
    -r, --recursive-cards [boolean]                          Add cards not only for input file entries, but also for every single word, character and component found in each entry. Default: false
    -p, --dictionary-priority-list [comma-separated-string]  List of dictionaries (offline and online) to gather data from. (highest priority first. Default: makemeahanzi,mdbg,forvo,archchinese)
    -h, --help                                               output usage information                         output usage information
```

# Donate

[![donate-button](https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=49DY4XCAQWG84)
