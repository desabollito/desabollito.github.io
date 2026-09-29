// Translation strings and default languages
JSONEditor.defaults.default_language = 'es';
JSONEditor.defaults.language = JSONEditor.defaults.default_language;
JSONEditor.defaults.languages.es = {
    /**
     * When a property is not set
     */
    error_notset: "Debe establecer la propiedad",
    /**
     * When a string must not be empty
     */
    error_notempty: "Falta ingresar este dato",
    /**
     * When a value is not one of the enumerated values
     */
    error_enum: "El valor debe ser uno de los valores enumerados",
    /**
     * When a value doesn't validate any schema of a 'anyOf' combination
     */
    error_anyOf: "El valor debe validar contra al menos uno de los esquemas proporcionados",
    /**
     * When a value doesn't validate
     * @variables This key takes one variable: The number of schemas the value does not validate
     */
    error_oneOf: 'El valor debe validar con respecto a exactamente uno de los esquemas previstos. En la actualidad valida contra {{0}} de los esquemas.',
    /**
     * When a value does not validate a 'not' schema
     */
    error_not: "El valor no debe validar contra el esquema proporcionado",
    /**
     * When a value does not match any of the provided types
     */
    error_type_union: "El valor debe ser uno de los tipos previstos",
    /**
     * When a value does not match the given type
     * @variables This key takes one variable: The type the value should be of
     */
    error_type: "El valor debe ser del tipo {{0}}",
    /**
     *  When the value validates one of the disallowed types
     */
    error_disallow_union: "El valor no debe ser uno de los tipos no permitidos proporcionados",
    /**
     *  When the value validates a disallowed type
     * @variables This key takes one variable: The type the value should not be of
     */
    error_disallow: "El valor no debe ser de tipo {{0}}",
    /**
     * When a value is not a multiple of or divisible by a given number
     * @variables This key takes one variable: The number mentioned above
     */
    error_multipleOf: "El valor debe ser un múltiplo de {{0}}",
    /**
     * When a value is greater than it's supposed to be (exclusive)
     * @variables This key takes one variable: The maximum
     */
    error_maximum_excl: "El valor debe ser menor a {{0}}",
    /**
     * When a value is greater than it's supposed to be (inclusive
     * @variables This key takes one variable: The maximum
     */
    error_maximum_incl: "El valor debe ser como máximo {{0}}",
    /**
     * When a value is lesser than it's supposed to be (exclusive)
     * @variables This key takes one variable: The minimum
     */
    error_minimum_excl: "El valor debe ser mayor a {{0}}",
    /**
     * When a value is lesser than it's supposed to be (inclusive)
     * @variables This key takes one variable: The minimum
     */
    error_minimum_incl: "El valor debe ser al menos {{0}}",
    /**
     * When a value have too many characters
     * @variables This key takes one variable: The maximum character count
     */
    error_maxLength: "El valor debe tener como máximo {{0}} caracteres de longitud",
    /**
     * When a value does not have enough characters
     * @variables This key takes one variable: The minimum character count
     */
    error_minLength: "El valor debe tener al menos {{0}} caracteres de longitud",
    /**
     * When a value does not match a given pattern
     */
    error_pattern: "El valor debe coincidir con el patrón {{0}}",
    /**
     * When an array has additional items whereas it is not supposed to
     */
    error_additionalItems: "La lista no permite elementos adicionales",
    /**
     * When there are to many items in an array
     * @variables This key takes one variable: The maximum item count
     */
    error_maxItems: "La lista debe tener como máximo {{0}} items",
    /**
     * When there are not enough items in an array
     * @variables This key takes one variable: The minimum item count
     */
    error_minItems: "La lista debe tener por lo menos {{0}} items",
    /**
     * When an array is supposed to have unique items but has duplicates
     */
    error_uniqueItems: "La lista debe tener elementos únicos",
    /**
     * When there are too many properties in an object
     * @variables This key takes one variable: The maximum property count
     */
    error_maxProperties: "El objeto debe tener como máximo {{0}} propiedades",
    /**
     * When there are not enough properties in an object
     * @variables This key takes one variable: The minimum property count
     */
    error_minProperties: "El objeto debe tener por lo menos {{0}} propiedades",
    /**
     * When a required property is not defined
     * @variables This key takes one variable: The name of the missing property
     */
    error_required: "No se encuentra la propiedad requerida '{{0}}'",
    /**
     * When there is an additional property is set whereas there should be none
     * @variables This key takes one variable: The name of the additional property
     */
    error_additional_properties: "No se permiten propiedades adicionales, pero se establece {{0}}",
    /**
     * When a dependency is not resolved
     * @variables This key takes one variable: The name of the missing property for the dependency
     */
    error_dependency: "Debe tener la propiedad {{0}}",
    /**
     * Text on Delete All buttons
     */
    button_delete_all: "Todos",
    /**
     * Title on Delete All buttons
     */
    button_delete_all_title: "Eliminar todos",
    /**
      * Text on Delete Last buttons
      * @variable This key takes one variable: The title of object to delete
      */
    button_delete_last: "Último {{0}}",
    /**
      * Title on Delete Last buttons
      * @variable This key takes one variable: The title of object to delete
      */
    button_delete_last_title: "Borrar último {{0}}",
    /**
      * Title on Add Row buttons
      * @variable This key takes one variable: The title of object to add
      */
    button_add_row_title: "Agregar {{0}}",
    /**
      * Title on Move Down buttons
      */
    button_move_down_title: "Bajar",
    /**
      * Title on Move Up buttons
      */
    button_move_up_title: "Subir",
    /**
      * Title on Delete Row buttons
      * @variable This key takes one variable: The title of object to delete
      */
    button_delete_row_title: "Borrar {{0}}",
    /**
      * Title on Delete Row buttons, short version (no parameter with the object title)
      */
    button_delete_row_title_short: "Borrar",
    /**
      * Title on Collapse buttons
      */
    button_collapse: "Colapsar",
    /**
      * Title on Expand buttons
      */
    button_expand: "Expandir"
};