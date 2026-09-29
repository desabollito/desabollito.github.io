angular
    .module('webApp')
    .controller('recuperarController', ['$scope', '$compile', '$location', '$uibModal', '$http', '$window', 'session', 'recuperar',
				recuperarController]);

function recuperarController($scope, $compile, $location, $uibModal, $http, $window, session, recuperar) {
    var vm = this;

    vm.cancelar = function () {
        $location.path('/');
    }

    vm.verificar = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            recaptchaCallback = function (token) {
                recuperar.obtener({ dominio: vm.Tramite.Dominio, chasis: window.btoa(vm.Tramite.Chasis), RecaptchaResponse: token }, function (data) {
                        grecaptcha.reset();

                        vm.Numero = data.Numero;
                        vm.Codigo = data.Codigo;
                        vm.Estado = data.Estado;

                        vm.MostrarResultado = true;
                    },
                    function (error) {
                        vm.formErrors = [];
                        if (error.data.ModelState) {
                            if (error.data.ModelState.captchaText) {
                                vm.formErrors.push(error.data.ModelState.captchaText[0]);
                            }
                        }
                        else {
                            vm.formErrors.push(error.data.ExceptionMessage);
                        }

                        grecaptcha.reset(vm.captchaObtenerTurnosId);
                    });
            };
            grecaptcha.execute();
        }
    }

    $scope.$on('validationInterceptor-detected', function (event, modelState) {
        vm.formErrors = modelState[""];
    });

}