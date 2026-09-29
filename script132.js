angular
    .module('webApp')
    .controller('presupuestoController', ['$scope', '$location', '$window', '$routeParams', '$filter', 'appConfig', 'session', 'SITE', presupuestoController]);

function presupuestoController($scope, $location, $window, $routeParams, $filter, appConfig, session, SITE) {
    $window.scrollTo(0, 0);

    var vm = this;

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.presupuesto = vm.solicitud.presupuesto;
    }

    vm.calcularTotalPresupuesto = function () {
        var total = 0;
        angular.forEach(vm.presupuesto.DetallePrecioPrecargaViewModel, function (value, key) {
            total += value.PrecioUnitario * value.Cantidad;
        });
        return total;
    };

    vm.imprimir = function () {
        window.print();
    }

    vm.Provincia = function (id) {
        return $filter('filter')(provincias, { Key: id })[0].Value;
    };

    vm.submit = function () {
        if (vm.solicitud.codigoTramite === "080000" || vm.solicitud.codigoTramite === "083000" || vm.solicitud.codigoTramite === "084000") {
            $location.path('/08D');
            return true;
        }
        iniciarGestionarTurno($scope, session);
        //OBTENER TIPOS DE TRAMITE PARA TURNOS
        recaptchaCallback = function (token) {
            SITE.obtenerTiposTramitesParaTurnos(
                {
                    RecaptchaResponse: token,
                    EsMandatario: false
                },
                function (data) {
                    grecaptcha.reset();

                    vm.solicitud = session.get(0);
                    vm.solicitud.esMandatario = false;
                    vm.solicitud.tiposTramites = data.TiposTramites;

                    $location.path('/seleccionarTramite');
                    return;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();

    };

    registerInterceptorValidationSummary($scope, vm, $window);
}