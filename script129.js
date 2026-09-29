angular
    .module('webApp')
    .controller('finalizarRsController', ['$scope', '$location', '$window', 'session', finalizarRsController]);

function finalizarRsController($scope, $location, $window, session) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Terminaste de cargar tu solicitud.');

    //BORRO LA SESION PARA QUE NO PUEDAN VOLVER PARA ATRAS
    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
    } else {
        vm.solicitud = clone(session.get(0));
        session.clear();
    }

    vm.submit = function () {
        $location.path('/');
    };
}