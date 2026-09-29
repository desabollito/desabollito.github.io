angular
    .module('webApp')
    .controller('tramiteController', ['$scope', '$location', 'session', tramiteController]);

function tramiteController($scope, $location, session) {
    var vm = this;

    vm.schema = '{"title":"Persona","type":"object","properties":{"apellido":{"title":"Apellido","type":"string","minLength":1},"nombre":{"title":"Nombre","type":"string","minLength":1},"tipoDocumento":{"title":"Tipo de Documento","type":"string","minLength":1,"enumSource":[{"source":[{"value":"","title":""},{"value":1,"title":"DNI"},{"value":2,"title":"Pasaporte"}],"title":"{{item.title}}","value":"{{item.value}}"}]},"numeroDocumento":{"title":"Número de Documento","type":"integer","minimum":1,"options":{"input_width":"150px"}},"fechaNacimiento":{"title":"Fecha de Nacimiento","type":"string","format":"maskdate","minLength":1,"options":{"input_width":"150px"}}},"required":["apellido","nombre","tipoDocumento","numeroDocumento","fechaNacimiento"]}';

    //var solicitud = session.get(0);
    //if (typeof (solicitud) === "undefined") {
    //    $location.path('/');
    //    return;
    //}

    vm.submit = function () {
        var errors = editor.validate();
        if (!errors.length) {
            //vm.formErrors = [];
            //$scope.$broadcast('show-errors-check-validity', 'form');
            //if (vm.form.$valid) {
            alert(JSON.stringify(editor.getValue()));
            $location.path('/turno');
            //}
        } else {
            editor.root.myShowValidationErrors(editor);
        }
    };
}