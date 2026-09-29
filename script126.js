angular
    .module('webApp')
    .controller('consultaTramiteController', ['$scope', '$location', '$window', 'ConsultaEstado', consultaTramiteController]);

function consultaTramiteController($scope, $location, $window, ConsultaEstado) {
    var vm = this;

    vm.buscar = function () {
        console.log('Ingreso a funcion');
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            console.log('Entro a consulta');
            console.log(vm.tipoConsulta);
            //recaptchaCallback = function (token) {
            if (vm.tipoConsulta === 'titulo') {
                ConsultaEstado.getTitulo({
                    valid: true,
                    codigoRs: vm.codigoRs,
                    numeroTramite: vm.numeroTramite,
                    codigoValidacion: vm.codigoValidacion
                }, function () {
                        console.log('Posta a consulta de tramites');
                    $location.path('/consultarTramite/' + vm.codigoRs + '/' + vm.numeroTramite + '/' + vm.codigoValidacion + '/' + vm.tipoConsulta);
                });
            } else {
                ConsultaEstado.getInformeDominio({
                    valid: true,
                    codigoRs: vm.codigoRs,
                    numeroTramite: vm.numeroTramite,
                    codigoValidacion: vm.codigoValidacion
                }, function () {
                        console.log('Posta a consulta de tramites');
                    $location.path('/consultarTramite/' + vm.codigoRs + '/' + vm.numeroTramite + '/' + vm.codigoValidacion + '/' + vm.tipoConsulta);
                });
            }
            //};
            //grecaptcha.execute();
        }
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}
