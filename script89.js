angular
    .module('webApp')
    .controller('gravamenesCompradoresController', ['$scope', '$compile', '$location', '$route', '$uibModal', 'popupService', 'session', 'home', 'provincia', 'localidad', 'Vendedor',
        gravamenesCompradoresController]);

function gravamenesCompradoresController($scope, $compile, $location, $route, $uibModal, popupService, session, home, provincia, localidad, Vendedor) {
    var vm = this;

    var tramite = session.get(0);
    if (typeof (tramite) === "undefined") {
        $location.path('/');
        return;
    }

    vm.Tramite = tramite;
    vm.gravamenes = tramite.Gravamenes || [];

    vm.agregarGravamen = function () {
        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/compradores/gravamen.html',
            controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {

                $scope.dateOptions = {
                    formatYear: 'yyyy',
                    startingDay: 1
                };
                $scope.open2 = function () {
                    $scope.popup2.opened = true;
                };
                $scope.popup2 = {
                    opened: false
                };

                $scope.aceptar = function () {
                    vm.formErrors = [];

                    $scope.$broadcast('show-errors-check-validity', 'form');
                    if ($scope.legalCtrl.form.$valid) {
                        var gravamen = new Gravamen();

                        gravamen.FechaInscripcion = $scope.FechaInscripcion;
                        gravamen.CausaAcreedor = $scope.CausaAcreedor;
                        gravamen.Monto = $scope.Monto;

                        $uibModalInstance.close(gravamen);
                    }
                }

                $scope.close = function () {
                    $scope.subtitulo1 = vm.subtitulo1;
                    $scope.mostrar = vm.mostrar;

                    $uibModalInstance.dismiss('cancel');
                }
            }],
            controllerAs: 'legalCtrl',
            backdrop: 'static',
            height: 200,
            resolve: {
            }
        });

        modalInstance.result.then(function (gravamen) {
            vm.gravamenes.push(gravamen);
        }, function () {
            //$log.info('Modal dismissed at: ' + new Date());
        });
    }

    vm.finalizar = function () {
        vm.formErrors = [];

        if (vm.gravamenes.length <= 0) {
            vm.formErrors.push('Debe agregar por lo menos una prenda y/o embargo, caso contrario presione Cancelar');
            return;
        }

        //$location.path("/seleccionarTurno");
        $location.path("/compradores/confirmar");
    }

    vm.confirmar = function () {
        vm.formErrors = [];

        Vendedor.saveList(tramite)
            .$promise
            .then(function () {
                session.clear();
                document.location = 'http://www.dnrpa.gov.ar/portal_dnrpa/';
            }, function (error) {
                vm.formErrors = [];
                vm.formErrors.push(error.data.ExceptionMessage);
            });
    }

    vm.EliminarGravamen = function (index) {
        vm.gravamenes.splice(index, 1);
    }

    $scope.$on('validationInterceptor-detected', function (event, modelState) {
        vm.formErrors = modelState[""];
    });
}