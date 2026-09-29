angular
    .module('webApp')
    .controller('finalizarController', ['$rootScope', '$scope', '$location', '$window', 'session', finalizarController]);

function finalizarController($rootScope, $scope, $location, $window, session) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Terminaste de cargar tu solicitud.');

    vm.esSiteRegistro = typeof ($rootScope.claims) !== "undefined" && $rootScope.claims !== "";
    if (vm.esSiteRegistro) {
        $location.path('/finalizarRs');
        return;
    }

    //BORRO LA SESION PARA QUE NO PUEDAN VOLVER PARA ATRAS
    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
    } else {
        vm.solicitud = clone(session.get(0));
        session.clear();
    }

    vm.iniciarEncuesta = function () {
        $location.path('/encuesta/' + vm.solicitud.numeroPrecarga + '/' + vm.solicitud.codigoParaServicios);
    };

    vm.submit = function () {
        $location.path('/');
    };
}