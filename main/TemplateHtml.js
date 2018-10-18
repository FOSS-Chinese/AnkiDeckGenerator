'use strict'

const mustache = require('mustache')

class TemplateHtml {
    constructor() {
        this.sectionCount = -1
    }

    function generateCollapsablePanel(heading,content,center,showByDefault) {
        if (!heading)
            return ''
        this.sectionCount++
        return `
            <div class="panel panel-primary">
              <div class="panel-heading" onclick="$('#collapse-${this.sectionCount}').toggle()">
                <h4 class="panel-title">
                  ${heading}
                </h4>
              </div>
              <div id="collapse-${this.sectionCount}" class="panel-collapse collapse ${showByDefault ? 'in' : ''}">
                <div class="panel-body ${center ? 'text-center' : ''}">
                  ${content}
                </div>
              </div>
            </div>
        `
    }

    async function generateAnswerTemplate(fields) {
        let collapsablePanels = ''
        for (let [i,field] of fields.entries()) {
            const content = field.html || `{{${field.name}}}`
            collapsablePanels += this.generateCollapsablePanel(field.displayName, content, !!field.center, i===0)
        }
        collapsablePanels += this.generateCollapsablePanel("Debug", `
            <div class="form-group">
                <textarea class="form-control rounded-0" id="debug-input" rows="5" onkeypress="if (event.keyCode == 13 && !event.shiftKey) { try { document.getElementById('debug-output').innerHTML=eval(document.getElementById('debug-input').value); } catch(e) { document.getElementById('debug-output').innerHTML=e; }; return false; }">jQuery.fn.jquery</textarea>
            </div>
            <div class="form-group">
                <button onclick="try { document.getElementById('debug-output').innerHTML=eval(document.getElementById('debug-input').value); } catch(e) { document.getElementById('debug-output').innerHTML=e; }" class="btn btn-danger btn-block">Execute</button>
            </div>
            <div class="form-group">
                <textarea readonly class="form-control rounded-0" id="debug-output" rows="5"></textarea>
            </div>
        `, false, false)
        const afmtTpl = await fs.readFile('./templates/afmt.mustache.html','utf8')
        const afmtTplView = {
            collapsablePanels: collapsablePanels,
            baseDeckId: baseDeck.baseConf.id,
            deckType: fields[0].name,
            panelCount: this.sectionCount
        }
        return mustache.render(afmtTpl, afmtTplView)
    }

    async generateQuestionSkipTemplate() {
        const questionSkipTemplate = await fs.readFile('./templates/qfmt.mustache.html','utf8')
        return mustache.render(questionSkipTemplate, {})
    }
}

module.exports = TemplateHtml
