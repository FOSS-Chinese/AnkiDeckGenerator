# AnkiDeckGenerator

Convert a list of Chinese characters/words/sentences or English words/sentences into extremely detailled Anki cards.

## TODO
- [x] Accept individual Chinese characters as input
- [ ] Accept Chinese words consisting of multiple characters as input
- [ ] Accept Chinese sentences consisting of multiple character as input
- [ ] Accept English words as input
- [ ] Accept English sentences as input
- [x] Generate Anki card data for the Hanzi
- [x] Generate Anki card data for the English translation
- [ ] Generate Anki card data for example words that contain a given cards Hanzi
- [ ] Generate Anki card data for the english translation of the example words
- [ ] Generate Anki card data for example sentences that contain a given cards Hanzi
- [ ] Generate Anki card data for the english translation of the example sentences
- [ ] Add multiple audio files for the pronunciation of the used Hanzi for every context
- [x] Generate Anki card data for the Pinyin
- [x] Generate Anki card data for the Hanzi decomposition
- [x] Generate Anki card data for the Hanzi type (ideographic/pictographic/pictophonetic)
- [x] Generate Anki card data for the Hanzi formation in case of ideographic/pictographic
- [x] Generate Anki card data for the semantic/phonetic Hanzi etymology in case of pictophonetic
- [x] Generate Anki card data for the primary radical of the Hanzi
- [x] Generate Anki card data for the charCode as used in JavaScript
- [x] Create a Stroke order diagram generator that outputs still images with numbers
- [x] and create a Pull Request at https://github.com/skishore/makemeahanzi adding this generator script and the generated stroke diagrams
- [x] Generate Anki card data for the charCode as used in JavaScript
- [ ] Copy the animated Hanzi stroke order diagrams into the deck output
- [ ] Copy the non-animated Hanzi stroke order diagrams into the deck output
- [ ] Write a bootstrap based Anki card template that uses all the features mentioned above (almost done)
- [x] Allow specifiying an output dir for the generated files
- [x] Write Anki card data in Anki compatible tsv format as output

## Requirements
- git
- nodejs

## Installation
```
git clone --recursive https://github.com/FOSS-Chinese/AnkiDeckGenerator.git
cd AnkiDeckGenerator
npm i
```

## Example Usage
```
node ./index.js -c ./example-input.txt -o ./deck
```

## Usage
```
Usage: index [options]

Options:

  -V, --version                         output the version number
  -c, --input-file-chinese <file-path>  File containing a json-array of Chinese characters, words and/or sentences
  -o, --output-folder <folder-path>     Folder in which the deck files will be written

  -h, --help                            output usage information
```
