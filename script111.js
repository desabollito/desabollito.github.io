angular
    .module('webApp')
    .controller('cancelarTurnoController', ['$scope', '$location', '$window', 'popupService', 'SITE', cancelarTurnoController]);

function cancelarTurnoController($scope, $location, $window, popupService, SITE) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Para cancelar tu turno, necesitamos que ingreses los datos que recibiste en el email de confirmación de turno.');

    vm.sitekeyI = $scope.$parent.appCtrl.reCaptchaSiteKey;

    if (typeof (grecaptcha) === "undefined") {
        $location.path('/');
        return;
    }

    vm.volver = function () {
        $location.path('/');
    };

    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            recaptchaCallback = function (token) {
                SITE.cancelarTurno({ NumeroPrecarga: vm.numeroPrecarga, CodigoParaServicios: vm.codigoServicios, RecaptchaResponse: token },
                    function (data) {
                        grecaptcha.reset();
                        popupService.showMessage('Turno cancelado exitosamente.', 'Cancelar Turno').then(function () {
                            $location.path('/');
                        });
                    },
                    function () {
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
        }
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}