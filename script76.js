angular
    .module('webApp')
    .controller('gravamenesVendedoresController', ['$scope', '$compile', '$location', '$route', '$uibModal', '$window', 'popupService', 'session', 'home', 'provincia', 'localidad', 'Vendedor',
        gravamenesVendedoresController]);

function gravamenesVendedoresController($scope, $compile, $location, $route, $uibModal, $window, popupService, session, home, provincia, localidad, Vendedor) {
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
            templateUrl: 'app/modules/vendedores/gravamen.html',
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
            height: 450,
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
        $location.path("/vendedores/confirmar");
    }

    vm.confirmar = function () {
        vm.formErrors = [];
        recaptchaCallback = function (token) {
            Vendedor.saveList(tramite)
                .$promise
                .then(function () {
                    grecaptcha.reset();

                    session.clear();
                    document.location = 'http://www.dnrpa.gov.ar/portal_dnrpa/';
                }, function (error) {
                    vm.formErrors = [];
                    vm.formErrors.push(error.data.ExceptionMessage);

                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    }

    vm.EliminarGravamen = function (index) {
        vm.gravamenes.splice(index, 1);
    }

    $scope.$on('validationInterceptor-detected', function (event, modelState) {
        vm.formErrors = modelState[""];
    });

}