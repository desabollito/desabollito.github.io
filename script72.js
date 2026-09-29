angular
    .module('webApp')
    .controller('aclaracionesController', ['$scope', '$http', '$routeParams', '$location', '$uibModal', aclaracionesController]);

function aclaracionesController($scope, $http, $routeParams, $location, $uibModal) {
    var vm = this;

    vm.mostrarRequisitos = function () {
        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/home/requisitosModal.html',
            controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
                $scope.close = function () {
                    $uibModalInstance.dismiss('cancel');
                }
            }]
        });

        modalInstance.result.then(function () {
        }, function () {
        });
    }

    vm.mostrarDatos = function () {
        modalInstance = $uibModal.open({
            animation: true,
            templateUrl: 'app/modules/home/datosModal.html',
            controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
                $scope.close = function () {
                    $uibModalInstance.dismiss('cancel');
                }
            }]
        });

        modalInstance.result.then(function () {
        }, function () {
        });
    }
};