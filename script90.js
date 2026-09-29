angular
    .module('webApp')
    .controller('finalCompradoresController', ['$scope', '$compile', '$location', '$route', '$uibModal', '$http', '$window', 'popupService', 'session', 'home', 'provincia', 'localidad', 'Vendedor',
        finalCompradoresController]);

function finalCompradoresController($scope, $compile, $location, $route, $uibModal, $http, $window, popupService, session, home, provincia, localidad, Vendedor) {
    $window.scrollTo(0, 0);
    var vm = this;

    var tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/');
        return;
    }

    vm.Tramite = tramite;

    vm.cerrar = function () {
        document.location = 'http://www.dnrpa.gov.ar/portal_dnrpa/';
    }

    vm.imprimir = function () {
        window.print();
    }
}