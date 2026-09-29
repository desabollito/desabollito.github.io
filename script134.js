angular
    .module('webApp')
    .controller('tramiteOnlineController', ['$scope', '$location', '$window', '$routeParams', 'appConfig', 'TramiteOnline', tramiteOnlineController]);

function tramiteOnlineController($scope, $location, $window, $routeParams, appConfig, TramiteOnline) {
    $window.scrollTo(0, 0);

    var vm = this;
    vm.codigoTramite = $routeParams.codigoTramite;
    vm.vehiculo = $routeParams.vehiculo;

    recaptchaCallback = function (token) {
        TramiteOnline.obtenerTipoTramite(
            {
                RecaptchaResponse: token,
                Version: appConfig.version,
                CodigoTramite: vm.codigoTramite,
                Vehiculo: vm.vehiculo
            },
            function (data) {
                vm.nombreTramite = data.NombreTramite;
                grecaptcha.reset();
            },
            function () {
                grecaptcha.reset();
            });
    };
    grecaptcha.execute();

    registerInterceptorValidationSummary($scope, vm, $window);
}