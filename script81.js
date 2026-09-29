angular
    .module('webApp')
    .controller('finalVendedoresController', ['$scope', '$compile', '$location', '$route', '$uibModal', '$http', '$window', 'popupService', 'session', 'home', 'provincia', 'localidad', 'Vendedor',
        finalVendedoresController]);

function finalVendedoresController($scope, $compile, $location, $route, $uibModal, $http, $window, popupService, session, home, provincia, localidad, Vendedor) {
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
}