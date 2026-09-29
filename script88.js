angular
    .module('webApp')
    .controller('compradorshController', ['$scope', '$http', '$routeParams', '$location', '$uibModal', '$rootScope', 'session', 'Comprador', compradorshController]);

function compradorshController($scope, $http, $routeParams, $location, $uibModal, $rootScope, session, Comprador) {
    var vm = this;

    var tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/');
        return;
    }

    var comprador = session.get(1);
    if (typeof (comprador) !== "undefined") {
        if (typeof (comprador.solicitante) !== "undefined") {
            comprador = undefined;
        }
    }

    if (typeof (comprador) === "undefined") {
        vm.comprador = new PersonaFisica();
        vm.comprador.Tipo = 'E';
        vm.comprador.PorcentajeBien = 100;
    }
    else {
        vm.comprador = comprador;
        session.remove(1);
    }

    vm.subtitulo1 = $rootScope.subtitulo1;
    vm.mostrar = $rootScope.mostrar;

    vm.dateOptions = {
        formatYear: 'yyyy',
        startingDay: 1
    };
    vm.open2 = function () {
        vm.popup2.opened = true;
    };
    vm.popup2 = {
        opened: false
    };

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
            case "B": return "Comprador";
            case "C": return "Conyuge";
            case "S": return "Sociedad de Hecho";
            default:
                return "";
        }
    }

    vm.EliminarRepresentante = function (index) {
        vm.comprador.Apoderados.splice(index, 1);
    }
    vm.EliminarFirmante = function (index) {
        vm.comprador.Firmantes.splice(index, 1);
    }


    vm.guardar = function () {
        vm.formErrors = [];
        if (vm.comprador.Firmantes.length <= 0) {
            vm.formErrors.push('Debe Cargar al menos un Representante para la certificación de firmas');
            return;
        }

        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {

            var tramite = session.get(0);

            vm.comprador.FullName = vm.comprador.RazonSocial;

            tramite.Compradores = tramite.Compradores || [];
            tramite.Compradores.push(vm.comprador);

            session.set(0, tramite);

            $location.path('/compradores/index');
        }
    };

    vm.agregarRepresentante = function () {
        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/compradores/compradorshsocio.html',
            controller: ['$scope', '$uibModalInstance', 'comprador', function ($scope, $uibModalInstance, comprador) {

                $scope.comprador = comprador;

                $scope.roles = [
                    { text: 'Legal', value: '1' },
                    { text: 'Apoderado', value: '2' },
                    { text: 'Socio', value: 'S' }
                ];
                $scope.shouldShow = function (rol) {
                    return ($scope.comprador.Tipo === 'E') || rol.value !== 'S';
                }
                $scope.representados = [
                    { text: 'Comprador', value: 'B' },
                    { text: 'Conyuge', value: 'C' },
                    { text: 'Sociedad de Hecho', value: 'S' }
                ];
                $scope.shouldShowRepresentado = function (representado) {
                    return ($scope.comprador.Tipo === 'E') || representado.value !== 'S';
                }

                $scope.Representado = "S";

                $scope.aceptar = function () {
                    var apoderado = new ApoderadoVendedor();

                    apoderado.Rol = $scope.Rol;
                    apoderado.CuitCuil = $scope.CuitCuil;
                    apoderado.Apellido = $scope.Apellido;
                    apoderado.Nombre = $scope.Nombre;
                    apoderado.Representado = "S";

                    $scope.comprador.Firmantes.push(apoderado);

                    $uibModalInstance.close($scope.comprador);
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
                comprador: function () {
                    return vm.comprador;
                }
            }
        });

        modalInstance.result.then(function (comprador) {
            vm.comprador = comprador;
        }, function () {
            //$log.info('Modal dismissed at: ' + new Date());
        });
    }

    //$scope.$on('validationInterceptor-detected', function (event, modelState) {
    //    vm.formErrors = modelState[""];
    //});
};