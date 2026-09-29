angular
    .module('webApp')
    .controller('compradorController', ['$scope', '$http', '$routeParams', '$location', '$window', 'session', 'PrCrg', compradorController]);

function compradorController($scope, $http, $routeParams, $location, $window, session, PrCrg) {
    var vm = this;

    vm.cancelar = function () {
        $location.path('/');
    }

    vm.siguiente = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            recaptchaCallback = function (token) {
                PrCrg.obtenerPrecarga({ numeroPrecarga: vm.precarga, dominio: vm.dominio, RecaptchaResponse: token },
                    function(data) {
                        grecaptcha.reset();

                        session.add(data);
                        $location.path('/compradores/dominio');
                    },
                    function() {
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
        }
    }

    registerInterceptorValidationSummary($scope, vm, $window);
};