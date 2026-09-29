/// <reference path="../viewmodel/Vendedor.js" />

angular
    .module('webApp')
    .controller('vendedorphController', ['$rootScope', '$scope', '$http', '$routeParams', '$location', '$uibModal', 'Vendedor', 'session', vendedorphController]);

function vendedorphController($rootScope, $scope, $http, $routeParams, $location, $uibModal, Vendedor, session) {
    var vm = this;

    var tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/');
        return;
    }

    vm.editar = false;
    vm.esMandatario = tramite.esMandatario;
    vm.esEscribano = tramite.esEscribano;
    vm.mostrarDetalle = vm.esMandatario || vm.esEscribano;

    var vendedor = session.get(1);
    if (typeof (vendedor) !== "undefined") {
        if (typeof (vendedor.solicitante) !== "undefined") {
            vendedor = undefined;
        }
        if (vm.esEscribano && tramite.Vendedores.length ===0) {
            vendedor = undefined;
        }
    }


    //console.log(tramite);
    //console.log(vendedor);
    //console.log(typeof (vendedor));
    if (typeof (vendedor) === "undefined") {
        vm.vendedor = new PersonaFisica();
        vm.vendedor.Tipo = 'F';
        vm.vendedor.EstadoCivil = '1';
        vm.vendedor.CaracterBien = 'P';
        vm.vendedor.PorcentajeBien = 100;
        vm.vendedor.Apoderados = [];
    }
    else {
        vm.editar = true;
        vm.vendedor = vendedor;
        session.remove(1);
    }

    $scope.$watch('vendedorCtrl.vendedor.EstadoCivil', function (newVal, oldVal) {

        if (newVal !== '2') {
            vm.vendedor.Conyuge.TipoDocumento = '1';
            vm.vendedor.Conyuge.NroDocumento = '';
            vm.vendedor.Conyuge.Nombre = '';
            vm.vendedor.Conyuge.Apellido = '';
            vm.vendedor.Conyuge.CaracterBien = 'P';
        }

    });

    vm.subtitulo1 = $rootScope.subtitulo1;
    vm.mostrar = $rootScope.mostrar;

    if (vm.vendedor.Apoderados) {
        vm.mostrarApoderado = vm.vendedor.Apoderados.length;
    }

    vm.Representante = function (representante) {
        switch (representante) {
            case "1": return "Legal";
            case "2": return "Apoderado";
            case "S": return "Socio";
            default: return "Socio";
        }
    }

    vm.RepresentaA = function (representaA) {
        switch (representaA) {
            case "V": return "Vendedor";
            case "C": return "Conyuge";
            case "S": return "Sociedad de Hecho";
            default:
                return "";
        }
    }

    vm.EliminarRepresentante = function (index) {
        vm.vendedor.Apoderados.splice(index, 1);
    }

    vm.cancelar = function () {
        if (vm.editar) {
            var tramite = session.get(0);
            tramite.Vendedores.push(vm.vendedor);
            session.set(0, tramite);
        }
        $location.path('/titulares');
    }

    vm.guardar = function () {
        
        var tramite = session.get(0);
        tramite.Vendedores = tramite.Vendedores || [];
        vm.formErrors = [];
        var suma = 0;
        for (var i = 0; i < tramite.Vendedores.length; i++) {
            suma += tramite.Vendedores[i].PorcentajeBien;
        }
        suma += vm.vendedor.PorcentajeBien;

        if (suma > 100) {
            vm.formErrors.push('La Suma de Porcentaje no puede superar el 100%');
            return;
        }

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {

            if (vm.vendedor.EstadoCivil !== '2') {
                vm.vendedor.CaracterBien = 'P';
            }

            tramite.Vendedores.push(vm.vendedor);

            session.set(0, tramite);

            $location.path('/titulares');
        }
    };

    vm.agregarRepresentante = function () {
        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/vendedores/vendedorshsocio.html',
            controller: ['$scope', '$uibModalInstance', 'vendedor', function ($scope, $uibModalInstance, vendedor) {

                $scope.vendedor = vendedor;

                $scope.roles = [
                    { text: 'Legal', value: '1' },
                    { text: 'Apoderado', value: '2' },
                    { text: 'Socio', value: 'S' }
                ];
                $scope.shouldShow = function (rol) {
                    return ($scope.vendedor.Tipo === 'E') || rol.value !== 'S';
                }
                $scope.representados = [
                    { text: 'Vendedor', value: 'V' },
                    { text: 'Conyuge', value: 'C' },
                    { text: 'Sociedad de Hecho', value: 'S' }
                ];
                $scope.shouldShowRepresentado = function (representado) {
                    return ($scope.vendedor.Tipo === 'E') || representado.value !== 'S';
                }

                $scope.Representado = "V";

                $scope.aceptar = function () {

                    if (!$scope.legalCtrl.form.$valid) {
                        return;
                    }

                    var apoderado = new ApoderadoVendedor();

                    apoderado.Rol = $scope.Rol;
                    apoderado.CuitCuil = $scope.CuitCuil;
                    apoderado.Apellido = $scope.Apellido;
                    apoderado.Nombre = $scope.Nombre;
                    if ($scope.vendedor.EstadoCivil === '2') {
                        apoderado.Representado = $scope.Representado;
                    }
                    else {
                        apoderado.Representado = "V";
                    }

                    $scope.vendedor.Apoderados.push(apoderado);

                    $uibModalInstance.close($scope.vendedor);
                }

                $scope.close = function () {
                    $scope.subtitulo1 = vm.subtitulo1;
                    $scope.mostrar = vm.mostrar;

                    $uibModalInstance.dismiss('cancel');
                }
            }],
            controllerAs: 'legalCtrl',
            backdrop: 'static',
            resolve: {
                vendedor: function () {
                    return vm.vendedor;
                }
            }
        });

        modalInstance.result.then(function (vendedor) {
            vm.vendedor = vendedor;
        }, function () {
            //$log.info('Modal dismissed at: ' + new Date());
        });
    }


    //$scope.$on('validationInterceptor-detected', function (event, modelState) {
    //    vm.formErrors = modelState[""];
    //});
};