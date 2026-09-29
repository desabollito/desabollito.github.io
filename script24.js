//CONFIGURACION JSON-EDITOR
JSONEditor.defaults.options.theme = 'bootstrap3';
JSONEditor.defaults.options.disable_collapse = true;
JSONEditor.defaults.options.disable_edit_json = true;
JSONEditor.defaults.options.disable_properties = true;
JSONEditor.defaults.options.disable_array_reorder = true;
JSONEditor.defaults.options.disable_array_delete_all_rows = true;
JSONEditor.defaults.options.disable_array_delete_last_row = true;
//JSONEditor.defaults.options.show_errors = "interaction";//No usar CHANGE ya que no funciona la validacion del select

//VALIDATORS
JSONEditor.defaults.custom_validators.push(function (schema, value, path) {
    var errors = [];
    if (schema.format === "maskdate") {
        if (!/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/.test(value)) {
            // Errors must be an object with `path`, `property`, and `message`
            errors.push({
                path: path,
                property: 'format',
                message: 'Las fechas deben estar en el formato "DD/MM/AAAA"'
            });
        }
    }
    return errors;
});
//END:VALIDATORS

//EACH COPIADO DE jsoneditor.js
var $each = function (obj, callback) {
    if (!obj || typeof obj !== "object") return;
    var i;
    if (Array.isArray(obj) || (typeof obj.length === 'number' && obj.length > 0 && (obj.length - 1) in obj)) {
        for (i = 0; i < obj.length; i++) {
            if (callback(i, obj[i]) === false) return;
        }
    }
    else {
        if (Object.keys) {
            var keys = Object.keys(obj);
            for (i = 0; i < keys.length; i++) {
                if (callback(keys[i], obj[keys[i]]) === false) return;
            }
        }
        else {
            for (i in obj) {
                if (!obj.hasOwnProperty(i)) continue;
                if (callback(i, obj[i]) === false) return;
            }
        }
    }
};

JSONEditor.defaults.editors.object = JSONEditor.defaults.editors.object.extend({
    myShowValidationErrors: function (rooteditor) {
        var self = rooteditor;

        $each(self.editors, function (i, editor) {
            editor.is_dirty = true;
        });

        self.validation_results = self.validator.validate(self.root.getValue());
        if (self.options.show_errors !== "never") {
            self.root.showValidationErrors(self.validation_results);
        }
    },
    //layoutEditors: function () {
    //    var self = this, i, j;

    //    if (!this.row_container) return;

    //    // Sort editors by propertyOrder
    //    this.property_order = Object.keys(this.editors);
    //    this.property_order = this.property_order.sort(function (a, b) {
    //        var ordera = self.editors[a].schema.propertyOrder;
    //        var orderb = self.editors[b].schema.propertyOrder;
    //        if (typeof ordera !== "number") ordera = 1000;
    //        if (typeof orderb !== "number") orderb = 1000;

    //        return ordera - orderb;
    //    });

    //    var container;

    //    if (this.format === 'grid') {
    //        //NO USAMOS GRID
    //    }
    //        // Normal layout
    //    else {
    //        container = document.createElement('div');
    //        var row;
    //        $each(this.property_order,
    //            function (i, key) {
    //                var editor = self.editors[key];
    //                if (editor.property_removed) return;
    //                if (i % 2 === 0) {//ES PAR
    //                    row = self.theme.getGridRow();
    //                }
    //                container.appendChild(row);
    //                if (editor.options.hidden) editor.container.style.display = 'none';
    //                else self.theme.setGridColumnSize(editor.container, 6);
    //                row.appendChild(editor.container);
    //            });
    //    }
    //    this.row_container.innerHTML = '';
    //    this.row_container.appendChild(container);
    //}
});

JSONEditor.defaults.themes.bootstrap3 = JSONEditor.defaults.themes.bootstrap3.extend({
    getIndentedPanel: function () {
        var el = document.createElement('div');
        el.className = '';
        el.style.paddingBottom = 0;
        return el;
    },
    getFormControl: function (label, input, description) {
        var group = document.createElement('div');

        if (label && input.type === 'checkbox') {
            group.className += ' checkbox';
            label.appendChild(input);
            label.style.fontSize = '14px';
            group.style.marginTop = '0';
            group.appendChild(label);
            input.style.position = 'relative';
            input.style.cssFloat = 'left';
        }
        else {
            group.className += ' form-group';
            if (label) {
                label.className += ' control-label';
                group.appendChild(label);
            }
            group.appendChild(input);
        }

        //MASK DATE
        if (input.attributes["data-schemaformat"] && input.attributes["data-schemaformat"].value === "maskdate") {
            initMaskDate(input);
        }

        //RATING
        if (input.attributes["data-schemaformat"] && input.attributes["data-schemaformat"].value === "rating") {
            initRating(input);
        }

        if (description) group.appendChild(description);

        return group;
    },
    addInputError: function (input, text) {
        if (!input.controlgroup) return;
        input.controlgroup.className += ' has-error';
        if (!input.errmsg) {
            input.errmsg = document.createElement('p');
            input.errmsg.className = 'help-block errormsg';
            input.controlgroup.appendChild(input.errmsg);
        } else {
            input.errmsg.style.display = '';
        }

        input.errmsg.textContent = text;
    },
    getFormInputDescription: function (text) {
        var el = document.createElement('p');
        el.className = 'text-muted';
        el.innerHTML = text;
        return el;
    }
});

var JSONEditorRegister = function () {
    this._super();
    if (!this.input) return;
    this.input.setAttribute('name', this.formname);
    this.input.setAttribute('id', this.path);

    if (!this.label) return;
    this.label.setAttribute('for', this.path);
};

var showValidationErrors = function (errors) {
    var self = this;

    if (this.jsoneditor.options.show_errors === "always") { }
    else if (!this.is_dirty && this.previous_error_setting === this.jsoneditor.options.show_errors) return;

    this.previous_error_setting = this.jsoneditor.options.show_errors;

    var messages = [];
    $each(errors, function (i, error) {
        if (error.path === self.path) {
            messages.push(error.message);
        }
    });

    if (messages.length) {
        this.theme.addInputError(this.input, messages.join('. ') + '.');
    }
    else {
        this.theme.removeInputError(this.input);
    }
};

//REGISTER SELECT2
//setupSelect2: function() { xxx }
JSONEditor.defaults.editors.string = JSONEditor.defaults.editors.string.extend({
    register: JSONEditorRegister
});
JSONEditor.defaults.editors.number = JSONEditor.defaults.editors.number.extend({
    register: JSONEditorRegister
});
JSONEditor.defaults.editors.integer = JSONEditor.defaults.editors.integer.extend({
    register: JSONEditorRegister
});
JSONEditor.defaults.editors.select = JSONEditor.defaults.editors.select.extend({
    register: JSONEditorRegister,
    showValidationErrors: showValidationErrors
});
JSONEditor.defaults.editors.multiselect = JSONEditor.defaults.editors.multiselect.extend({
    register: JSONEditorRegister
});
JSONEditor.defaults.editors.selectize = JSONEditor.defaults.editors.selectize.extend({
    register: JSONEditorRegister
});
JSONEditor.defaults.editors.checkbox = JSONEditor.defaults.editors.checkbox.extend({
    register: JSONEditorRegister
});

//ACA INICIA
var editor;
function initJSONEditor(element, schema, value, disabled) {
    if (editor) {
        editor.destroy();
    }

    //IMPLEMENTAR DIRECTIVA
    editor = new JSONEditor(element, {
        schema: JSON.parse(schema)
    });

    if (value) {
        editor.setValue(JSON.parse(value));
    }

    if (disabled) {
        editor.disable();
    }

    return editor;
}

function initMaskDate(input) {
    $(input).inputmask("date", { "placeholder": "dd/mm/aaaa" })
        .change(function () {
            var path = $(this).parents().filter('[data-schemapath]').eq(0).data('schemapath');
            var date = $(this).val();
            $(this).val('');
            editor.getEditor(path).setValue(date);
        });
}

function initRating(input) {
    $(input).rating({ min: 0, max: 5, step: 1, size: 'xs', showClear: false })
        .change(function () {
            var path = $(this).parents().filter('[data-schemapath]').eq(0).data('schemapath');
            var valor = $(this).val();
            $(this).val('');
            editor.getEditor(path).setValue(valor);
        });
}