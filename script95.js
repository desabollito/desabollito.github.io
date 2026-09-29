angular
    .module('webApp')
    .controller('informesWebController', ['$scope', '$location', '$window', 'session', informesWebController]);

function informesWebController($scope, $location, $window, session) {
    $window.scrollTo(0, 0);
    iniciarInformeWeb($scope, session);
    $location.path('/solicitante');
}