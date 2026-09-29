angular
    .module('webApp')
    .controller('asistenciaController', ['$scope', '$window', asistenciaController]);

function asistenciaController($scope, $window) {
    $window.scrollTo(0, 0);

    var vm = this;

    vm.codigoTemaChanged = function ($item, $model) {
        alert($item);
        //vm.noImplementado = !$item.Implementado;
        //vm.vehiculos = $item.Vehiculos;
        //vm.descripcion = $item.Descripcion;
        //vm.requisitos = $item.Requisitos;
        //vm.tipoTramiteConceptoCertificaFirma = $item.TipoTramiteConceptoRequiereF13I;
        //vm.tipoTramiteConceptoRequiereF13I = $item.TipoTramiteConceptoRequiereF13I;
    };
}