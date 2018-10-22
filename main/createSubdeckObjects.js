'use strict'

const TemplateHtml = require('./TemplateHtml')
const templateHtml = new TemplateHtml()

// Create sub decks, models and templates. One model per sub deck. One template per model.
async function createSubdeckObjects(apkg, fields, baseDeck, subDeckNames) {
    const decks = []
    const models = []
    const templates = []
    const questionSkipTemplate = await templateHtml.generateQuestionSkipTemplate()

    // Given subdecks get one subdeck per field
    for (let [i,subDeckName] of subDeckNames.entries()) {
        subDeckName = baseDeck.name ? `${baseDeck.name}::${subDeckName}` : subDeckName
        for (const [i,field] of fields.entries()) {
            // Create a fields array where the first entry is the field of the current iteration
            const reorderedFields = JSON.parse(JSON.stringify(fields)).sort((x,y) => x.name === field.name ? -1 : y.name === field.name ? 1 : 0)
            const template = {
                name: `${field.name}Template`,
                qfmt: questionSkipTemplate,
                afmt: await templateHtml.generateAnswerTemplate(reorderedFields, baseDeck)
            }
            templates.push(template)

            const deckToCreate = {
                name: `${subDeckName}::${field.displayName}`,
                desc: `Subdeck for learning by ${field.displayName}`
            }
            const deck = await apkg.addDeck(deckToCreate)
            decks.push(deck)

            const modelToCreate = {
                name: `model`,
                flds: fields.filter(field=>!field.skipField).map(field=>{return {name:field.name}}),
                tmpls: templates,
                css: ''
            }
            const model = await apkg.addModel(modelToCreate)
        }
    }
    return {decks,models,templates}
}

module.exports = createSubdeckObjects
