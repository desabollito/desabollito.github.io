angular
    .module('webApp')
    .controller('iniciarTramiteController', ['$scope', '$location', 'session', iniciarTramiteController]);

function iniciarTramiteController($scope, $location, session) {
    var vm = this;

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    }
}