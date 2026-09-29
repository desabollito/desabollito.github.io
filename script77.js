angular
    .module('webApp')
    .controller('calculadorController', ['$scope', '$http', '$routeParams', '$location', 'home', 'provincia', 'localidad', 'session', 'Formulario01D', calculadorController]);

function calculadorController($scope, $http, $routeParams, $location, home, provincia, localidad, session, Formulario01D) {
    var vm = this;

    vm.Calculador = new CalculadorViewModel();

    vm.Calcular = function () {
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            vm.Calculador.TipoVehiculo = 'Q';
            //vm.Calculador.Chasis = window.btoa(vm.Calculador.Chasis);
            Formulario01D.Consultar(vm.Calculador, function (data) {
                //vm.Calculador.Chasis = window.atob(vm.Calculador.Chasis);
                vm.Presupuesto = data;

                vm.Total = function () {
                    var tot = vm.Presupuesto.Importe;
                    for (var i = 0; i < vm.Presupuesto.Conceptos.length; i++) {
                        tot += vm.Presupuesto.Conceptos[i].Importe;
                    }
                    return tot;
                }
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
            });
        }
    }

    vm.sumarCedulas = function (codigoSuministro) {
        if (codigoSuministro === 'CE')
            vm.Calculador.CantidadCedulas++;
        else
            vm.Calculador.CantidadCedulasAdicionales++;
    }

    vm.restarCedulas = function (codigoSuministro) {
        if (codigoSuministro === 'CE') {
            vm.Calculador.CantidadCedulas = vm.Calculador.CantidadCedulas - 1;
            if (vm.Calculador.CantidadCedulas < 0)
                vm.Calculador.CantidadCedulas = 0;
        }
        else {
            vm.Calculador.CantidadCedulasAdicionales = vm.Calculador.CantidadCedulasAdicionales - 1;
            if (vm.Calculador.CantidadCedulasAdicionales < 0)
                vm.Calculador.CantidadCedulasAdicionales = 0;
        }
    }
};