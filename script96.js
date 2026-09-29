angular
    .module('webApp')
    .controller('retiroDeTramitesController', ['$scope', '$location', '$window', 'session', retiroDeTramitesController]);

function retiroDeTramitesController($scope, $location, $window, session) {
    $window.scrollTo(0, 0);
    iniciarRetirarDocumentacion($scope, session);
    $location.path('/identificarTramite');
}