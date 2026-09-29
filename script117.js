angular
    .module('webApp')
    .controller('identificarRegistroController', ['$scope', '$window', '$location', 'session', identificarRegistroController]);

function identificarRegistroController($scope, $window, $location, session) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Busque el registro a través de la patente de un vehículo o por la ubicación del registro.');

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    }

    vm.buscarDominio = function () {
        if (vm.solicitud.operacion === OperacionEnum.Turno) {
            $location.path('/identificarDominio');
            return;
        }
    };

    vm.buscarRegistro = function () {
        if (vm.solicitud.operacion === OperacionEnum.Turno) {
            $location.path('/seleccionarRegistro');
            return;
        }
    };
}