angular
    .module('webApp')
    .controller('turnosController', ['$scope', '$location', '$window', 'session', 'SITE', turnosController]);

function turnosController($scope, $location, $window, session, SITE) {
    $window.scrollTo(0, 0);
    var vm = this;
    iniciarGestionarTurno($scope, session);
    
    recaptchaCallback = function (token) {
        SITE.obtenerTiposTramitesParaTurnos(
            {
                RecaptchaResponse: token
            },
            function (data) {
                grecaptcha.reset();
                session.get(0).tiposTramites = data.TiposTramites;
                $location.path('/seleccionarTramite');
                return;
            },
            function () {
                grecaptcha.reset();
            });
    };
    grecaptcha.execute();
}