angular
    .module('webApp')
    .controller('resumenController', ['$scope', '$filter', 'session',
        function ($scope, $filter, session) {
            var vm = this;
            vm.solicitud = session.get(0);

            vm.TipoDocumento = function (tipoDoc) {
                switch (tipoDoc) {
                    case "1":
                        return "DNI";
                    case "2":
                        return "Libreta Enrolamiento";
                    case "3":
                        return "Libreta Cívica";
                    case "4":
                        return "DNI Extranjero";
                    case "5":
                        return "Cédula Extranjero";
                    case "6":
                        return "Pasaporte";
                    case "8":
                        return "CUIT/CUIL/CDI";
                    default:
                        return "";
                }
            };

            vm.Provincia = function (id) {
                return $filter('filter')(provincias, { Key: id })[0].Value;
            };

        }
    ])
    .directive('resumen', [
        function () {
            return {
                restrict: 'E',
                controller: 'resumenController',
                controllerAs: 'resumenCtrl',
                templateUrl: './app/directives/resumen.html'
            }
        }
    ]);